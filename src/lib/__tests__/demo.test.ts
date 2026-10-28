// The demo backend mirrors the SQL rules, so these double as a spec for them.
import { beforeAll, expect, it } from '@jest/globals';

import { demoBackend as api, DEMO_CODE } from '../demo';

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
  const scan = await api.checkIn(dinner, mine.ticket_code);
  expect(scan).toMatchObject({ ok: false, message: 'Not paid yet', ref: mine.order!.ref });

  // A screenshot counts as "I've paid"; the committee sees it in Orders.
  await api.uploadReceipt('order', { id: mine.order!.id, society_id: CODING_SOCIETY }, 'data:image/jpeg;base64,AAAA');
  const listed = (await api.listOrders(CODING_SOCIETY)).find((o) => o.id === mine.order!.id)!;
  expect(listed).toMatchObject({ status: 'payment_claimed', event_id: dinner });
  expect(await api.receiptUrl(listed.receipt_path!)).toBe('data:image/jpeg;base64,AAAA');

  await api.setOrderStatus([listed.id], 'paid');
  await expect(api.setOrderStatus([listed.id], 'ready')).rejects.toThrow('event ticket');
  expect((await api.checkIn(dinner, mine.ticket_code)).ok).toBe(true);

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

it('saves interests from the society categories only', async () => {
  await api.updateProfile({ interests: ['Music', 'Tech'] });
  expect((await api.getProfile())?.interests).toEqual(['Music', 'Tech']);
  await expect(api.updateProfile({ interests: ['Gambling'] })).rejects.toThrow('interests');
});
