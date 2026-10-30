// The demo backend mirrors the SQL rules, so these double as a spec for them.
import { beforeAll, expect, it } from '@jest/globals';

import { demoBackend as api, DEMO_CODE } from '../demo';
import { ticketToken } from '../ticketToken';

const eid = (n: number) => `20000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const CODING_SOCIETY = '10000000-0000-4000-8000-000000000002';

beforeAll(async () => {
  await api.verifyCode('tester@link.cuhk.edu.hk', DEMO_CODE);
});

it('rejects the wrong sign-in code and non-CUHK emails', async () => {
  await expect(api.verifyCode('tester@link.cuhk.edu.hk', '000000')).rejects.toThrow(DEMO_CODE);
  await expect(api.sendCode('tester@gmail.com')).rejects.toThrow('CUHK');
});

it('waitlists when full and promotes with a notification when seats open', async () => {
  const id = eid(9); // a Coding Society event, which the demo user runs
  const event = (await api.getEvent(id))!;
  await api.saveEvent({ ...event, capacity: event.confirmed_count, registration_opens_at: null });
  const reg = await api.register(id);
  expect(reg.status).toBe('waitlisted');
  expect(await api.waitlistPosition(id)).toBe(1);

  await api.saveEvent({ ...(await api.getEvent(id))!, capacity: event.confirmed_count + 5 });
  expect((await api.myRegistration(id))?.status).toBe('confirmed');
  const inbox = await api.listNotifications();
  expect(inbox[0]).toMatchObject({ kind: 'waitlist_promoted', event_id: id, read_at: null });
});

it('waitlists behind people already queueing', async () => {
  const full = eid(1); // capacity 30, 30 going, 4 already waiting
  expect((await api.register(full)).status).toBe('waitlisted');
  expect(await api.waitlistPosition(full)).toBe(5);
});

it('stores the answer to the sign-up question and shows it to the committee', async () => {
  const hackNight = eid(2);
  const event = (await api.getEvent(hackNight))!;
  expect(event.signup_question).toBeTruthy();
  await api.register(hackNight, '  A bus app  ');
  const me = (await api.listAttendees(hackNight)).find((a) => !a.registration_id.includes('fake'));
  expect(me?.answer).toBe('A bus app');
});

it('lets the committee check people in by hand and undo it', async () => {
  const hackNight = eid(2);
  const [first] = await api.listAttendees(hackNight);
  await api.setCheckedIn(first.registration_id, true);
  expect((await api.listAttendees(hackNight))[0].checked_in_at).not.toBeNull();
  await api.setCheckedIn(first.registration_id, false);
  expect((await api.listAttendees(hackNight))[0].checked_in_at).toBeNull();
});

it('tells registrants when an event moves or is cancelled', async () => {
  const hackNight = eid(2);
  const event = (await api.getEvent(hackNight))!;
  await api.saveEvent({ ...event, location: 'LT2' });
  expect((await api.listNotifications())[0]).toMatchObject({ kind: 'event_updated', body: expect.stringContaining('地點有變') });
  await api.saveEvent({ ...event, location: 'LT2', status: 'cancelled' });
  expect((await api.listNotifications())[0].kind).toBe('event_cancelled');
  await api.markAllNotificationsRead();
  expect(await api.unreadNotificationCount()).toBe(0);
});

it('manages the committee', async () => {
  await api.addMember(CODING_SOCIETY, 'New.Person@link.cuhk.edu.hk', 'editor');
  let members = await api.listMembers(CODING_SOCIETY);
  const added = members.find((m) => m.email === 'new.person@link.cuhk.edu.hk')!;
  expect(added).toMatchObject({ role: 'editor', display_name: 'New Person' });

  await api.setMemberRole(CODING_SOCIETY, added.user_id, 'admin');
  await api.transferOwnership(CODING_SOCIETY, added.user_id);
  members = await api.listMembers(CODING_SOCIETY);
  expect(members[0]).toMatchObject({ user_id: added.user_id, role: 'owner' });
  expect(members.find((m) => m.user_id === 'demo-user')?.role).toBe('admin');
  await expect(api.transferOwnership(CODING_SOCIETY, 'demo-m1')).rejects.toThrow('owner');
});

it('hides an event once moderators remove it', async () => {
  const target = eid(4);
  await api.report('event', target, 'Spam');
  const reports = await api.openReports();
  const mine = reports.find((r) => r.target_id === target)!;
  expect(mine.report_count).toBe(1);
  await api.resolveReport(mine.id, 'removed');
  expect(await api.getEvent(target)).toBeNull();
  expect((await api.listEvents({})).some((e) => e.id === target)).toBe(false);
  expect((await api.openReports()).some((r) => r.target_id === target)).toBe(false);
  await expect(api.register(target)).rejects.toThrow();
});

it('lets only current members sign up for members-only events', async () => {
  const hike = eid(10); // Hiking Club, members only; the demo user is not a member
  await expect(api.register(hike)).rejects.toThrow('members only');
  const plan = (await api.listPlans('10000000-0000-4000-8000-000000000001')).find((p) => p.is_open)!;
  const m = await api.joinSociety({
    plan_id: plan.id,
    full_name: 'Tester',
    student_id: '',
    college: '',
    major: '',
    phone: '',
    answers: [],
    payment_method: 'cash',
  });
  // A paid membership only counts once the committee approves the payment.
  expect(m.status).toBe('pending');
  await expect(api.register(hike)).rejects.toThrow('members only');
});

it('hides a society and unfollows it', async () => {
  await api.setFollow(CODING_SOCIETY, true);
  await api.setSocietyHidden(CODING_SOCIETY, true);
  expect(await api.myHiddenSocietyIds()).toContain(CODING_SOCIETY);
  expect(await api.myFollowIds()).not.toContain(CODING_SOCIETY);
  await api.setSocietyHidden(CODING_SOCIETY, false);
  expect(await api.myHiddenSocietyIds()).not.toContain(CODING_SOCIETY);
});

it('runs a paid ticket through payment, screenshot and check-in', async () => {
  const dinner = eid(14); // Coding Society year-end dinner, HK$180 (members HK$150)
  await expect(api.register(dinner)).rejects.toThrow('Choose how you will pay');
  await api.register(dinner, 'Vegetarian', 'fps');
  const mine = (await api.myRegistration(dinner))!;
  expect(mine.order).toMatchObject({ status: 'awaiting_payment', total_hkd: 180, payment_method: 'fps' });
  expect(mine.order!.expires_at).not.toBeNull();

  // Unpaid tickets don't get in at the door.
  const scan = await api.checkIn(dinner, ticketToken(mine.id, mine.ticket_code));
  expect(scan).toMatchObject({ ok: false, message: 'Not paid yet', ref: mine.order!.ref });

  // A screenshot counts as "I've paid"; the committee sees it in Orders.
  await api.uploadReceipt('order', { id: mine.order!.id, society_id: CODING_SOCIETY }, 'data:image/jpeg;base64,AAAA');
  const listed = (await api.listOrders(CODING_SOCIETY)).find((o) => o.id === mine.order!.id)!;
  expect(listed).toMatchObject({ status: 'payment_claimed', event_id: dinner });
  expect(await api.receiptUrl(listed.receipt_path!)).toBe('data:image/jpeg;base64,AAAA');

  await api.setOrderStatus([listed.id], 'paid');
  await expect(api.setOrderStatus([listed.id], 'ready')).rejects.toThrow('event ticket');
  // The fixed code and an old screenshot don't work; the live QR does.
  expect((await api.checkIn(dinner, mine.ticket_code)).message).toMatch(/^Old QR code/);
  expect((await api.checkIn(dinner, ticketToken(mine.id, mine.ticket_code, Date.now() - 120_000))).message).toMatch(/^QR code expired/);
  expect((await api.checkIn(dinner, ticketToken(mine.id, mine.ticket_code))).ok).toBe(true);

  // Refunding gives the place up.
  const going = (await api.getEvent(dinner))!.confirmed_count;
  await api.setOrderStatus([listed.id], 'refunded');
  expect((await api.myRegistration(dinner))?.status).toBe('cancelled');
  expect((await api.getEvent(dinner))!.confirmed_count).toBe(going - 1);
});

it('cancelling a paid sign-up cancels its unpaid order', async () => {
  const dinner = eid(14);
  await api.register(dinner, '', 'cash');
  const mine = (await api.myRegistration(dinner))!;
  expect(mine.order).toMatchObject({ status: 'awaiting_payment', expires_at: null });
  await api.cancelRegistration(dinner);
  const order = (await api.myOrders()).find((o) => o.id === mine.order!.id)!;
  expect(order.status).toBe('cancelled');
});

it('saves events privately and only ones you can see', async () => {
  const before = await api.mySavedEventIds();
  await api.setEventSaved(eid(3), true);
  expect((await api.mySavedEventIds())[0]).toBe(eid(3));
  expect((await api.listEvents({ ids: [eid(3)] })).map((e) => e.id)).toEqual([eid(3)]);
  await api.setEventSaved(eid(3), false);
  expect(await api.mySavedEventIds()).toEqual(before);
  await expect(api.setEventSaved('20000000-0000-4000-8000-999999999999', true)).rejects.toThrow('Event not found');
});

it('takes online payments only where the society is verified, and only the provider marks them paid', async () => {
  const products = await api.listProducts(CODING_SOCIETY);
  const p = products.find((x) => x.status === 'published' && x.variants.some((v) => v.stock == null || v.stock > (x.sold[v.name] ?? 0)))!;
  const v = p.variants.find((x) => x.stock == null || x.stock > (p.sold[x.name] ?? 0))!;
  expect(await api.onlinePaymentsReady(CODING_SOCIETY)).toBe(true);
  expect(await api.onlinePaymentsReady('10000000-0000-4000-8000-000000000001')).toBe(false);

  const o = await api.placeBagOrder(CODING_SOCIETY, [{ product_id: p.id, variant: v.name, qty: 1 }], 'online', null);
  expect(new Date(o.expires_at!).getTime() - Date.now()).toBeLessThanOrEqual(30 * 60_000);
  await expect(api.claimOrderPaid(o.id)).rejects.toThrow('confirmed automatically');
  await expect(api.setOrderStatus([o.id], 'paid')).rejects.toThrow('confirmed automatically');

  expect(await api.startOnlinePayment(o.id)).toBeNull();
  const paid = (await api.listOrders(CODING_SOCIETY)).find((x) => x.id === o.id)!;
  expect(paid.status).toBe('paid');
  expect(paid.platform_fee_hkd).toBe(Math.min(o.total_hkd, Math.round(o.total_hkd * 5 + 300) / 100));

  await expect(api.setOrderStatus([o.id], 'refunded')).rejects.toThrow('Refund button');
  await api.refundOnlineOrder(o.id);
  expect((await api.myOrders()).find((x) => x.id === o.id)?.status).toBe('refunded');
});

it('runs a fair: booths, presale on its own, vouchers used a few at a time, sales for the organiser', async () => {
  const fairs = await api.listFairs();
  const christmas = fairs.find((f) => f.name === 'Chung Chi Christmas Fair')!;
  const own = fairs.find((f) => f.organiser_society_id === CODING_SOCIETY)!;
  expect(christmas.can_manage).toBe(false);
  expect(own.can_manage).toBe(true);

  const products = await api.listFairProducts(christmas.id);
  const tea = products.find((p) => p.title === 'Bubble tea voucher')!;
  expect(tea).toMatchObject({ booth: 'B12', kind: 'voucher' });

  // Fair items and everyday shop items don't share an order.
  const shop = (await api.listProducts(CODING_SOCIETY)).find((p) => !p.fair_id && p.status === 'published')!;
  await expect(
    api.placeBagOrder(
      CODING_SOCIETY,
      [
        { product_id: tea.id, variant: '', qty: 1 },
        { product_id: shop.id, variant: shop.variants[0].name, qty: 1 },
      ],
      'cash',
      null,
    ),
  ).rejects.toThrow('on their own');

  const o = await api.placeBagOrder(CODING_SOCIETY, [{ product_id: tea.id, variant: '', qty: 3 }], 'cash', null);
  expect(o).toMatchObject({ fair_id: christmas.id, vouchers_total: 3, vouchers_used: 0 });
  expect(o.items[0].kind).toBe('voucher');

  expect((await api.collectOrder(CODING_SOCIETY, o.pickup_code)).message).toBe('Take cash');
  expect(await api.collectOrder(CODING_SOCIETY, o.pickup_code, true)).toMatchObject({ message: 'How many vouchers?', cash_taken: true });
  expect((await api.collectOrder(CODING_SOCIETY, o.pickup_code, false, 4)).message).toBe('Not that many vouchers left');
  expect(await api.collectOrder(CODING_SOCIETY, o.pickup_code, false, 1)).toMatchObject({ ok: true, vouchers_left: 2 });
  expect(await api.collectOrder(CODING_SOCIETY, o.pickup_code, false, 2)).toMatchObject({ ok: true, vouchers_left: 0 });
  expect((await api.collectOrder(CODING_SOCIETY, o.pickup_code, false, 1)).message).toBe('All vouchers used');

  // Only the organiser sees sales per booth.
  await expect(api.fairSales(christmas.id)).resolves.toBeDefined(); // the demo user is a platform admin
  const fair = (await api.getFair(own.id))!;
  const request = fair.booths.find((b) => b.status === 'pending')!;
  await api.reviewBooth(request.id, 'approved', 'E3');
  expect((await api.getFair(own.id))!.booths.find((b) => b.id === request.id)).toMatchObject({ status: 'approved', label: 'E3' });
  expect((await api.fairSales(own.id)).some((s) => s.booth === 'E3')).toBe(true);
});

it('lets the committee post, pin one post and take reports down', async () => {
  const before = await api.listPosts(CODING_SOCIETY);
  expect(before[0].pinned).toBe(true);
  const id = await api.savePost({
    society_id: CODING_SOCIETY,
    body: '  Slides from tonight are up  ',
    image_urls: [],
    event_id: eid(9),
    pinned: true,
  });
  const posts = await api.listPosts(CODING_SOCIETY);
  expect(posts[0]).toMatchObject({ id, body: 'Slides from tonight are up', pinned: true, event: { id: eid(9) } });
  expect(posts.filter((p) => p.pinned)).toHaveLength(1);
  // Only the society's own events can be promoted.
  await expect(api.savePost({ society_id: CODING_SOCIETY, body: 'Hi', image_urls: [], event_id: eid(1), pinned: false })).rejects.toThrow();
  // Not the demo user's society.
  await expect(
    api.savePost({ society_id: '10000000-0000-4000-8000-000000000001', body: 'Hi', image_urls: [], event_id: null, pinned: false }),
  ).rejects.toThrow();

  await api.setPostLiked(id, true);
  await api.setPostLiked(id, true);
  expect((await api.getPost(id))?.like_count).toBe(1);
  expect(await api.myLikedPostIds([id])).toEqual([id]);

  await api.report('post', id, 'Spam or scam');
  const report = (await api.openReports()).find((r) => r.target_id === id)!;
  expect(report.target_name).toBe('CU Coding Society: Slides from tonight are up');
  await api.resolveReport(report.id, 'removed');
  // The committee still sees it, marked as taken down and no longer pinned.
  expect(await api.getPost(id)).toMatchObject({ pinned: false, removed_at: expect.any(String) });
  await api.deletePost(id);
  expect(await api.getPost(id)).toBeNull();
});
