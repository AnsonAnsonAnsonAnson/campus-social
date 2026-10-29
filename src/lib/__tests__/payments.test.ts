import { createHmac, webcrypto } from 'crypto';

import { describe, expect, it } from '@jest/globals';

import {
  accountStatus,
  checkoutSessionBody,
  connectedAccountBody,
  formEncode,
  returnUrl,
  toCents,
  verifySignature,
  webhookAction,
  type CheckoutInfo,
} from '../../../supabase/functions/_shared/stripe';
import { feeLabel, methodLabel, platformFeeHkd } from '../commerce';

const FEE = { percent: 5, fixed_hkd: 3 };

describe('platform fee', () => {
  it('is a percentage plus a fixed amount, rounded to cents like the SQL', () => {
    expect(platformFeeHkd(200, FEE)).toBe(13);
    expect(platformFeeHkd(99.9, FEE)).toBe(8);
    expect(platformFeeHkd(33.3, { percent: 3.5, fixed_hkd: 0 })).toBe(1.17);
  });
  it('never takes more than the order, and nothing from free orders', () => {
    expect(platformFeeHkd(2, FEE)).toBe(2);
    expect(platformFeeHkd(0, FEE)).toBe(0);
  });
  it('reads as people write it', () => {
    expect(feeLabel(FEE)).toBe('5% + HK$3');
    expect(feeLabel({ percent: 4.5, fixed_hkd: 0 })).toBe('4.5%');
    expect(methodLabel('fps')).toBe('FPS');
  });
});

const INFO: CheckoutInfo = {
  order_id: '11111111-1111-4111-8111-111111111111',
  ref: 'CUC-1234',
  society_id: '22222222-2222-4222-8222-222222222222',
  society_name: 'CUCS',
  items: [
    { title: 'Hoodie', variant: 'M', qty: 2, unit_price: '200.00' },
    { title: 'Tote', variant: '', qty: 1, unit_price: 59.5 },
  ],
  product_title: 'Hoodie, Tote',
  total_hkd: '459.50',
  fee_hkd: '25.98',
  account_id: 'acct_123',
  email: 'a@link.cuhk.edu.hk',
  locale: 'zh-Hant',
};

describe('checkout page', () => {
  const body = checkoutSessionBody(INFO, { returnBase: 'https://example.com/return.html', expiresAt: 1800000000 });

  it('charges the order total in cents, line by line', () => {
    expect(body.line_items.map((l) => [l.price_data.product_data.name, l.price_data.unit_amount, l.quantity])).toEqual([
      ['Hoodie · M', 20000, 2],
      ['Tote', 5950, 1],
    ]);
    expect(body.line_items[0].price_data.currency).toBe('hkd');
  });

  it('sends the money to the society less the platform fee', () => {
    expect(body.payment_intent_data.transfer_data.destination).toBe('acct_123');
    expect(body.payment_intent_data.application_fee_amount).toBe(2598);
    expect(body.metadata.order_id).toBe(INFO.order_id);
  });

  it('offers cards, Alipay and WeChat Pay, in Chinese by default', () => {
    expect(body.payment_method_types).toEqual(['card', 'alipay', 'wechat_pay']);
    expect(body.payment_method_options).toEqual({ wechat_pay: { client: 'web' } });
    expect(body.locale).toBe('zh-HK');
    expect(
      checkoutSessionBody({ ...INFO, locale: 'en' }, { returnBase: 'https://x.com/r', expiresAt: 1, methods: ['card'] }),
    ).toMatchObject({
      locale: 'en',
      payment_method_types: ['card'],
    });
  });

  it('comes back to the order in the app', () => {
    expect(body.success_url).toBe(`https://example.com/return.html?to=order%2F${INFO.order_id}&paid=1`);
    expect(returnUrl('https://x.com/r', 'manage/payment-settings?societyId=1')).toBe(
      'https://x.com/r?to=manage%2Fpayment-settings%3FsocietyId%3D1',
    );
  });

  it('refuses an order whose lines do not add up', () => {
    expect(() => checkoutSessionBody({ ...INFO, total_hkd: 1 }, { returnBase: 'https://x.com/r', expiresAt: 1 })).toThrow();
  });

  it('rounds HK$ to cents without float drift', () => {
    expect(toCents('19.99')).toBe(1999);
    expect(toCents(0.29)).toBe(29);
  });
});

describe('Stripe form encoding', () => {
  it('flattens nested objects and arrays', () => {
    expect(formEncode({ a: 1, b: { c: 'x', d: [true, { e: 2 }] }, skip: undefined })).toEqual([
      ['a', '1'],
      ['b[c]', 'x'],
      ['b[d][0]', 'true'],
      ['b[d][1][e]', '2'],
    ]);
  });
  it('builds a Hong Kong account the platform pays fees for', () => {
    const enc = Object.fromEntries(formEncode(connectedAccountBody('s1', 'CUCS', null)));
    expect(enc).toMatchObject({
      country: 'HK',
      'controller[fees][payer]': 'application',
      'controller[stripe_dashboard][type]': 'express',
      'capabilities[transfers][requested]': 'true',
      'metadata[society_id]': 's1',
      'settings[payouts][schedule][interval]': 'weekly',
    });
  });
});

describe('webhooks', () => {
  const ev = (type: string, object: Record<string, unknown>) => ({ id: 'evt_1', type, data: { object } });

  it('a paid checkout page pays the order', () => {
    expect(
      webhookAction(ev('checkout.session.completed', { id: 'cs_1', payment_status: 'paid', payment_intent: 'pi_1', amount_total: 45950 })),
    ).toEqual({
      kind: 'paid',
      session: 'cs_1',
      paymentIntent: 'pi_1',
      method: null,
      amount: 459.5,
    });
  });
  it('an unpaid completion waits for the async result', () => {
    expect(webhookAction(ev('checkout.session.completed', { id: 'cs_1', payment_status: 'unpaid' })).kind).toBe('ignore');
  });
  it('expiry, failure, refunds and account changes', () => {
    expect(webhookAction(ev('checkout.session.expired', { id: 'cs_2' }))).toEqual({ kind: 'closed', session: 'cs_2', status: 'expired' });
    expect(webhookAction(ev('checkout.session.async_payment_failed', { id: 'cs_3' }))).toMatchObject({ status: 'failed' });
    expect(webhookAction(ev('charge.refunded', { payment_intent: 'pi_9', amount_refunded: 1000 }))).toEqual({
      kind: 'refunded',
      paymentIntent: 'pi_9',
      refunded: 10,
    });
    expect(webhookAction(ev('account.updated', { id: 'acct_1' })).kind).toBe('account');
    expect(webhookAction(ev('payout.paid', {})).kind).toBe('ignore');
  });
  it('reads account status', () => {
    expect(
      accountStatus({
        id: 'acct_1',
        charges_enabled: false,
        details_submitted: true,
        requirements: { currently_due: ['a', 'b'], past_due: ['b'], disabled_reason: 'requirements.past_due' },
        metadata: { society_id: 's1' },
      }),
    ).toEqual({
      account_id: 'acct_1',
      society_id: 's1',
      charges: false,
      payouts: false,
      details: true,
      due: 2,
      disabled_reason: 'requirements.past_due',
    });
  });

  describe('signatures', () => {
    const payload = '{"id":"evt_1"}';
    const sign = (secret: string, t: number) => `t=${t},v1=${createHmac('sha256', secret).update(`${t}.${payload}`).digest('hex')}`;
    const subtle = webcrypto.subtle as unknown as SubtleCrypto;
    const now = 1_800_000_000;

    it('accepts either endpoint’s secret', async () => {
      expect(await verifySignature(payload, sign('whsec_b', now), ['whsec_a', 'whsec_b'], { now, subtle })).toBe(true);
    });
    it('rejects a wrong secret, a stale timestamp, or no header', async () => {
      expect(await verifySignature(payload, sign('whsec_x', now), ['whsec_a'], { now, subtle })).toBe(false);
      expect(await verifySignature(payload, sign('whsec_a', now - 600), ['whsec_a'], { now, subtle })).toBe(false);
      expect(await verifySignature(payload, null, ['whsec_a'], { now, subtle })).toBe(false);
      expect(await verifySignature(payload + ' ', sign('whsec_a', now), ['whsec_a'], { now, subtle })).toBe(false);
    });
  });
});
