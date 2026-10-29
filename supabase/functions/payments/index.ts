// Online payments for signed-in app users (Stripe Connect). One function, one
// action per call, body {action, ...}:
//
//   connect    {society_id}  society admin: link to Stripe's onboarding pages
//   refresh    {society_id}  society admin: re-read the account after onboarding
//   dashboard  {society_id}  society admin: link to the payouts dashboard
//   checkout   {order_id}    buyer: link to the payment page for an online order
//   refund     {order_id}    society admin: refund a paid online order in full
//
// Secrets (Supabase dashboard > Edge Functions > Secrets): STRIPE_SECRET_KEY,
// and optionally PAYMENTS_RETURN_URL (defaults to the GitHub Pages return page)
// and STRIPE_METHODS (comma list, default "card,alipay,wechat_pay").
// The database decides who may do what; see migration v08_online_payments.
import { createClient } from 'npm:@supabase/supabase-js@2';

import { accountStatus, checkoutSessionBody, connectedAccountBody, makeStripe, returnUrl, toCents } from '../_shared/stripe.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: cors });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const key = Deno.env.get('STRIPE_SECRET_KEY');
  if (!key) return json({ error: 'Online payments are not set up yet' }, 503);
  const stripe = makeStripe(key);
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const returnBase = Deno.env.get('PAYMENTS_RETURN_URL') ?? 'https://ansonansonansonanson.github.io/campus-social/return.html';

  const jwt = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  const { data: auth } = await db.auth.getUser(jwt);
  if (!auth.user) return json({ error: 'Sign in again' }, 401);
  const userId = auth.user.id;

  const rpc = async <T>(fn: string, args: Record<string, unknown>) => {
    const { data, error } = await db.rpc(fn, args);
    if (error) throw new Error(error.message);
    return data as T;
  };

  try {
    const body = await req.json();
    switch (body.action) {
      case 'connect': {
        const info = await rpc<{ account_id: string | null; name: string; email: string | null }>('payout_onboarding_info', {
          p_society_id: body.society_id,
          p_user: userId,
        });
        let accountId = info.account_id;
        if (!accountId) {
          // Idempotent per society, so a double tap doesn't make two accounts.
          const account = await stripe<{ id: string }>(
            'POST',
            'accounts',
            connectedAccountBody(body.society_id, info.name, info.email),
            `account-${body.society_id}`,
          );
          accountId = account.id;
          await rpc('sync_payout_account', {
            p_society_id: body.society_id,
            p_account_id: accountId,
            p_charges: false,
            p_payouts: false,
            p_details: false,
            p_due: 0,
            p_disabled_reason: null,
            p_user: userId,
          });
        }
        const back = `manage/payment-settings?societyId=${body.society_id}`;
        const link = await stripe<{ url: string }>('POST', 'account_links', {
          account: accountId,
          type: 'account_onboarding',
          refresh_url: returnUrl(returnBase, back, { retry: '1' }),
          return_url: returnUrl(returnBase, back),
        });
        return json({ url: link.url });
      }

      case 'refresh': {
        const info = await rpc<{ account_id: string | null }>('payout_onboarding_info', {
          p_society_id: body.society_id,
          p_user: userId,
        });
        if (!info.account_id) return json({ account: null });
        const s = accountStatus(await stripe('GET', `accounts/${info.account_id}`));
        const account = await rpc('sync_payout_account', {
          p_society_id: body.society_id,
          p_account_id: s.account_id,
          p_charges: s.charges,
          p_payouts: s.payouts,
          p_details: s.details,
          p_due: s.due,
          p_disabled_reason: s.disabled_reason,
        });
        return json({ account });
      }

      case 'dashboard': {
        const info = await rpc<{ account_id: string | null }>('payout_onboarding_info', {
          p_society_id: body.society_id,
          p_user: userId,
        });
        if (!info.account_id) throw new Error('This society has not set up online payments');
        const link = await stripe<{ url: string }>('POST', `accounts/${info.account_id}/login_links`);
        return json({ url: link.url });
      }

      case 'checkout': {
        const info = await rpc<Parameters<typeof checkoutSessionBody>[0] & { open_sessions: string[] }>('online_checkout_info', {
          p_order_id: body.order_id,
          p_user: userId,
        });
        // Close earlier pages for this order, so it can't be paid twice from two tabs.
        for (const s of info.open_sessions) {
          await stripe('POST', `checkout/sessions/${s}/expire`).catch(() => null);
        }
        // Stripe needs at least 30 minutes; the order holds stock 5 minutes beyond it.
        const expiresAt = Math.floor(Date.now() / 1000) + 31 * 60;
        const methods = (Deno.env.get('STRIPE_METHODS') ?? '')
          .split(',')
          .map((m) => m.trim())
          .filter(Boolean);
        const session = await stripe<{ id: string; url: string; expires_at: number }>(
          'POST',
          'checkout/sessions',
          checkoutSessionBody(info, { returnBase, methods, expiresAt }),
        );
        await rpc('record_checkout_session', {
          p_order_id: info.order_id,
          p_session_id: session.id,
          p_url: session.url,
          p_expires_at: new Date(session.expires_at * 1000).toISOString(),
          p_amount: info.total_hkd,
          p_fee: info.fee_hkd,
        });
        return json({ url: session.url });
      }

      case 'refund': {
        const info = await rpc<{ payment_intent: string; amount_hkd: number }>('online_refund_info', {
          p_order_id: body.order_id,
          p_user: userId,
        });
        // The society's share comes back from the society; the platform fee is
        // not returned to it (a refund costs the society the fee, as the terms say).
        const refund = await stripe<{ amount: number }>(
          'POST',
          'refunds',
          { payment_intent: info.payment_intent, reverse_transfer: true, refund_application_fee: false },
          `refund-${info.payment_intent}`,
        );
        await rpc('record_online_refund', { p_payment_intent: info.payment_intent, p_refunded: refund.amount / 100 });
        return json({ refunded: refund.amount / 100, cents: toCents(info.amount_hkd) });
      }

      default:
        return json({ error: 'Unknown action' }, 400);
    }
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 400);
  }
});
