// Stripe tells us here when a payment page is paid, expires or fails, when a
// payment is refunded (also from Stripe's dashboard), and when a society's
// payout account changes. This is the only way an online order becomes paid.
//
// In Stripe: Developers > Webhooks, add two endpoints pointing at this function
// (deploy it with --no-verify-jwt):
//   "Your account": checkout.session.completed, checkout.session.async_payment_succeeded,
//     checkout.session.async_payment_failed, checkout.session.expired, charge.refunded
//   "Connected accounts": account.updated
// and put their signing secrets in STRIPE_WEBHOOK_SECRET and STRIPE_CONNECT_WEBHOOK_SECRET.
import { createClient } from 'npm:@supabase/supabase-js@2';

import { accountStatus, makeStripe, verifySignature, webhookAction } from '../_shared/stripe.ts';

Deno.serve(async (req) => {
  const key = Deno.env.get('STRIPE_SECRET_KEY');
  const secrets = [Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? '', Deno.env.get('STRIPE_CONNECT_WEBHOOK_SECRET') ?? ''];
  if (!key || !secrets.some(Boolean)) return new Response('Not configured', { status: 503 });

  const payload = await req.text();
  if (!(await verifySignature(payload, req.headers.get('Stripe-Signature'), secrets))) {
    return new Response('Bad signature', { status: 400 });
  }
  const event = JSON.parse(payload);
  const stripe = makeStripe(key);
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const rpc = async <T>(fn: string, args: Record<string, unknown>) => {
    const { data, error } = await db.rpc(fn, args);
    if (error) throw new Error(error.message);
    return data as T;
  };

  const action = webhookAction(event);
  if (action.kind === 'ignore') return Response.json({ ignored: event.type });

  try {
    switch (action.kind) {
      case 'paid': {
        // Which method the buyer used, for the treasurer's records.
        const pi = await stripe<{ latest_charge?: { payment_method_details?: { type?: string } } | null }>(
          'GET',
          `payment_intents/${action.paymentIntent}`,
          { expand: ['latest_charge'] },
        ).catch(() => null);
        const result = await rpc<string>('online_payment_succeeded', {
          p_session_id: action.session,
          p_payment_intent: action.paymentIntent,
          p_method: pi?.latest_charge?.payment_method_details?.type ?? null,
          p_amount: action.amount,
        });
        if (result === 'refund') {
          // Paid for an order that was cancelled or already paid: give it all
          // back, fee included, since nobody did anything wrong.
          await stripe(
            'POST',
            'refunds',
            { payment_intent: action.paymentIntent, reverse_transfer: true, refund_application_fee: true },
            `refund-${action.paymentIntent}`,
          );
          await rpc('record_online_refund', { p_payment_intent: action.paymentIntent, p_refunded: action.amount });
        }
        return Response.json({ result });
      }
      case 'closed':
        await rpc('online_payment_closed', { p_session_id: action.session, p_status: action.status });
        return Response.json({ result: action.status });
      case 'refunded':
        await rpc('record_online_refund', { p_payment_intent: action.paymentIntent, p_refunded: action.refunded });
        return Response.json({ result: 'refunded' });
      case 'account': {
        const s = accountStatus(action.account);
        await rpc('sync_payout_account', {
          p_society_id: null,
          p_account_id: s.account_id,
          p_charges: s.charges,
          p_payouts: s.payouts,
          p_details: s.details,
          p_due: s.due,
          p_disabled_reason: s.disabled_reason,
        });
        return Response.json({ result: 'account' });
      }
    }
  } catch (e) {
    // A 500 makes Stripe retry later.
    return new Response(e instanceof Error ? e.message : String(e), { status: 500 });
  }
});
