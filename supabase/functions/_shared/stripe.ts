// A small Stripe client for the payment edge functions: form-encoded REST calls,
// webhook signature checks, and the request bodies we send. Kept free of Deno
// and npm imports so the app's Jest tests can check the parts that decide money.

export type StripeError = { error?: { message?: string; code?: string } };

/** Stripe's form encoding: nested objects and arrays become `a[b][0]=c`. */
export function formEncode(value: unknown, prefix = '', out: [string, string][] = []): [string, string][] {
  if (value === undefined || value === null) return out;
  if (Array.isArray(value)) {
    value.forEach((v, i) => formEncode(v, `${prefix}[${i}]`, out));
  } else if (typeof value === 'object') {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) formEncode(v, prefix ? `${prefix}[${k}]` : k, out);
  } else {
    out.push([prefix, String(value)]);
  }
  return out;
}

export function makeStripe(secretKey: string, fetchImpl: typeof fetch = fetch) {
  return async function stripe<T = Record<string, unknown>>(
    method: 'GET' | 'POST',
    path: string,
    body?: Record<string, unknown>,
    idempotencyKey?: string,
  ): Promise<T> {
    const encoded = body ? new URLSearchParams(formEncode(body)).toString() : '';
    const res = await fetchImpl(`https://api.stripe.com/v1/${path}${method === 'GET' && encoded ? `?${encoded}` : ''}`, {
      method,
      headers: {
        Authorization: `Bearer ${secretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
      },
      body: method === 'POST' ? encoded : undefined,
    });
    const json = (await res.json()) as T & StripeError;
    if (!res.ok) throw new Error(json.error?.message ?? `Stripe error ${res.status}`);
    return json;
  };
}

/** HK$ with cents to Stripe's smallest unit. */
export function toCents(hkd: number | string) {
  return Math.round(Number(hkd) * 100);
}

/** Where the provider sends the browser back: a page on our site that reopens the app at `to`. */
export function returnUrl(base: string, to: string, extra: Record<string, string> = {}) {
  const u = new URL(base);
  u.searchParams.set('to', to);
  for (const [k, v] of Object.entries(extra)) u.searchParams.set(k, v);
  return u.toString();
}

export type CheckoutInfo = {
  order_id: string;
  ref: string;
  society_id: string;
  society_name: string;
  items: { title?: string | null; variant: string; qty: number; unit_price: number | string }[];
  product_title: string;
  total_hkd: number | string;
  fee_hkd: number | string;
  account_id: string;
  email: string | null;
  locale: string | null;
};

/** Methods offered on the checkout page. Apple Pay and Google Pay come with 'card'. */
export const DEFAULT_METHODS = ['card', 'alipay', 'wechat_pay'];

/**
 * The checkout page for one order: a destination charge, so the buyer pays the
 * platform, Stripe moves the total less our fee to the society's account, and
 * Stripe's own fee comes out of ours.
 */
export function checkoutSessionBody(info: CheckoutInfo, opts: { returnBase: string; methods?: string[]; expiresAt: number }) {
  const lineItems = info.items.map((i) => ({
    quantity: i.qty,
    price_data: {
      currency: 'hkd',
      unit_amount: toCents(i.unit_price),
      product_data: { name: [i.title ?? info.product_title, i.variant].filter(Boolean).join(' · ') },
    },
  }));
  const total = lineItems.reduce((n, l) => n + l.price_data.unit_amount * l.quantity, 0);
  if (total !== toCents(info.total_hkd)) throw new Error('Order total does not match its lines');
  const fee = Math.min(toCents(info.fee_hkd), total);
  const methods = opts.methods?.length ? opts.methods : DEFAULT_METHODS;
  const to = `order/${info.order_id}`;
  return {
    mode: 'payment',
    line_items: lineItems,
    payment_method_types: methods,
    ...(methods.includes('wechat_pay') ? { payment_method_options: { wechat_pay: { client: 'web' } } } : {}),
    client_reference_id: info.order_id,
    customer_email: info.email ?? undefined,
    locale: info.locale === 'en' ? 'en' : 'zh-HK',
    expires_at: opts.expiresAt,
    success_url: returnUrl(opts.returnBase, to, { paid: '1' }),
    cancel_url: returnUrl(opts.returnBase, to),
    metadata: { order_id: info.order_id, society_id: info.society_id, ref: info.ref },
    payment_intent_data: {
      application_fee_amount: fee,
      transfer_data: { destination: info.account_id },
      description: `${info.ref} · ${info.society_name}`,
      metadata: { order_id: info.order_id, society_id: info.society_id, ref: info.ref },
    },
  };
}

/**
 * A new connected account for a society. The platform pays Stripe's fees and
 * covers losses (destination charges), Stripe collects and checks the ID on its
 * own pages, and the society gets the light Express dashboard for payouts.
 * Weekly payouts keep the per-payout fee down.
 */
export function connectedAccountBody(societyId: string, societyName: string, email: string | null) {
  return {
    country: 'HK',
    email: email ?? undefined,
    controller: {
      fees: { payer: 'application' },
      losses: { payments: 'application' },
      requirement_collection: 'stripe',
      stripe_dashboard: { type: 'express' },
    },
    capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
    business_profile: {
      name: societyName,
      product_description: 'Student society merchandise sold to CUHK students through Campus Social',
    },
    settings: { payouts: { schedule: { interval: 'weekly', weekly_anchor: 'friday' } } },
    metadata: { society_id: societyId },
  };
}

type StripeAccount = {
  id: string;
  charges_enabled?: boolean;
  payouts_enabled?: boolean;
  details_submitted?: boolean;
  requirements?: { currently_due?: string[] | null; past_due?: string[] | null; disabled_reason?: string | null } | null;
  metadata?: Record<string, string> | null;
};

/** What we store about a connected account. */
export function accountStatus(a: StripeAccount) {
  const due = new Set([...(a.requirements?.currently_due ?? []), ...(a.requirements?.past_due ?? [])]);
  return {
    account_id: a.id,
    society_id: a.metadata?.society_id ?? null,
    charges: !!a.charges_enabled,
    payouts: !!a.payouts_enabled,
    details: !!a.details_submitted,
    due: due.size,
    disabled_reason: a.requirements?.disabled_reason ?? null,
  };
}

type StripeEvent = { id: string; type: string; data: { object: Record<string, unknown> } };

export type WebhookAction =
  | { kind: 'paid'; session: string; paymentIntent: string; method: string | null; amount: number }
  | { kind: 'closed'; session: string; status: 'expired' | 'failed' }
  | { kind: 'refunded'; paymentIntent: string; refunded: number }
  | { kind: 'account'; account: StripeAccount }
  | { kind: 'ignore' };

/** What a webhook event means for us. Amounts come back in HK$. */
export function webhookAction(e: StripeEvent): WebhookAction {
  const o = e.data.object as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  switch (e.type) {
    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded':
      if (o.payment_status !== 'paid') return { kind: 'ignore' };
      return {
        kind: 'paid',
        session: o.id,
        paymentIntent: typeof o.payment_intent === 'string' ? o.payment_intent : o.payment_intent?.id,
        // The session lists every method offered; the webhook looks up the one used.
        method: null,
        amount: (o.amount_total ?? 0) / 100,
      };
    case 'checkout.session.expired':
      return { kind: 'closed', session: o.id, status: 'expired' };
    case 'checkout.session.async_payment_failed':
      return { kind: 'closed', session: o.id, status: 'failed' };
    case 'charge.refunded':
      return {
        kind: 'refunded',
        paymentIntent: typeof o.payment_intent === 'string' ? o.payment_intent : o.payment_intent?.id,
        refunded: (o.amount_refunded ?? 0) / 100,
      };
    case 'account.updated':
      return { kind: 'account', account: o as StripeAccount };
    default:
      return { kind: 'ignore' };
  }
}

const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

/** Constant-time string compare. */
function same(a: string, b: string) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

/**
 * Checks a `Stripe-Signature` header (t=…,v1=…) against any of the signing
 * secrets (the platform endpoint and the connected-accounts endpoint have one each).
 */
export async function verifySignature(
  payload: string,
  header: string | null,
  secrets: string[],
  opts: { now?: number; toleranceSec?: number; subtle?: SubtleCrypto } = {},
) {
  if (!header) return false;
  const parts = header.split(',').map((p) => p.split('=') as [string, string]);
  const t = parts.find(([k]) => k === 't')?.[1];
  const sigs = parts.filter(([k]) => k === 'v1').map(([, v]) => v);
  if (!t || !sigs.length) return false;
  const now = opts.now ?? Math.floor(Date.now() / 1000);
  if (Math.abs(now - Number(t)) > (opts.toleranceSec ?? 300)) return false;
  const subtle = opts.subtle ?? globalThis.crypto.subtle;
  const enc = new TextEncoder();
  for (const secret of secrets.filter(Boolean)) {
    const key = await subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const expected = hex(await subtle.sign('HMAC', key, enc.encode(`${t}.${payload}`)));
    if (sigs.some((s) => same(s, expected))) return true;
  }
  return false;
}
