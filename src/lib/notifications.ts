// Local event reminders and Expo push registration. Inbox rows themselves live
// in the database (see the notifications table) and are read through `api`.
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { api } from './api';
import { confirmAsync } from './dialog';
import { formatTime } from './format';
import type { Ticket } from './types';

export const notificationsSupported = Platform.OS !== 'web';

const REMINDERS_KEY = 'settings.reminders';
const PUSH_TOKEN_KEY = 'push.token';
const ASKED_KEY = 'push.asked';
const REMINDER_PREFIX = 'reminder:';
const REMINDER_LEAD_MS = 60 * 60_000;
const ANDROID_CHANNEL = 'reminders';

if (notificationsSupported) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
  });
  if (Platform.OS === 'android') {
    Notifications.setNotificationChannelAsync(ANDROID_CHANNEL, {
      name: 'Event reminders and updates',
      // eslint-disable-next-line import/namespace -- re-exported enum the import plugin can't follow
      importance: Notifications.AndroidImportance.HIGH,
    }).catch(() => undefined);
  }
}

async function readSetting(key: string) {
  try {
    return await AsyncStorage.getItem(key);
  } catch {
    return null;
  }
}

export async function remindersEnabled() {
  return (await readSetting(REMINDERS_KEY)) !== 'off';
}

/** 'granted', 'denied' (must change in Settings) or 'undetermined' (we can still ask). */
export async function permissionState(): Promise<'granted' | 'denied' | 'undetermined'> {
  if (!notificationsSupported) return 'denied';
  const p = await Notifications.getPermissionsAsync();
  if (p.granted) return 'granted';
  return p.canAskAgain ? 'undetermined' : 'denied';
}

export async function requestPermission() {
  if (!notificationsSupported) return false;
  const p = await Notifications.requestPermissionsAsync();
  return p.granted;
}

/**
 * After someone's first sign-up, explain why notifications help before the
 * system prompt appears (asked once; iOS only lets an app ask one time).
 */
export async function offerNotifications() {
  if ((await permissionState()) !== 'undetermined' || (await readSetting(ASKED_KEY))) return;
  await AsyncStorage.setItem(ASKED_KEY, '1').catch(() => undefined);
  const yes = await confirmAsync(
    'Get a reminder before events?',
    "We'll remind you an hour before things you signed up for, and tell you straight away if you get off a waitlist.",
    'Turn on',
  );
  if (yes && (await requestPermission())) await registerForPush();
}

export async function setRemindersEnabled(on: boolean) {
  await AsyncStorage.setItem(REMINDERS_KEY, on ? 'on' : 'off').catch(() => undefined);
  await refreshReminders();
}

/**
 * Makes the scheduled reminders match the person's tickets: one an hour before
 * each confirmed, upcoming event. The id includes the start time, so a moved
 * event gets a new reminder and a cancelled ticket loses its reminder.
 */
export async function syncReminders(tickets: Ticket[]) {
  if (!notificationsSupported) return;
  const on = (await remindersEnabled()) && (await permissionState()) === 'granted';
  const wanted = new Map<string, Ticket>();
  if (on) {
    for (const t of tickets) {
      const fireAt = new Date(t.event.starts_at).getTime() - REMINDER_LEAD_MS;
      if (t.status === 'confirmed' && t.event.status === 'published' && fireAt > Date.now() + 60_000) {
        wanted.set(`${REMINDER_PREFIX}${t.event.id}:${t.event.starts_at}`, t);
      }
    }
  }
  const scheduled = (await Notifications.getAllScheduledNotificationsAsync()).filter((n) => n.identifier.startsWith(REMINDER_PREFIX));
  for (const n of scheduled) {
    if (!wanted.has(n.identifier)) await Notifications.cancelScheduledNotificationAsync(n.identifier);
  }
  const have = new Set(scheduled.map((n) => n.identifier));
  for (const [identifier, t] of wanted) {
    if (have.has(identifier)) continue;
    await Notifications.scheduleNotificationAsync({
      identifier,
      content: {
        title: `${t.event.title} starts at ${formatTime(t.event.starts_at)}`,
        body: `${t.event.location}. Your QR ticket is in the Tickets tab.`,
        data: { eventId: t.event.id },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: new Date(new Date(t.event.starts_at).getTime() - REMINDER_LEAD_MS),
        channelId: ANDROID_CHANNEL,
      },
    });
  }
}

/** Reloads tickets and reschedules reminders; errors are ignored (reminders are best effort). */
export async function refreshReminders() {
  try {
    await syncReminders((await api.getUser()) ? await api.myTickets() : []);
  } catch {
    // Offline or signed out: try again next time.
  }
}

/**
 * Registers this device for push messages sent by supabase/functions/send-push.
 * Needs an EAS project id (set by `eas init`) and notification permission.
 */
export async function registerForPush() {
  if (!notificationsSupported || !Device.isDevice || api.isDemo) return;
  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId || (await permissionState()) !== 'granted') return;
  try {
    const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
    await api.registerPushToken(data, Platform.OS === 'ios' ? 'ios' : 'android');
    await AsyncStorage.setItem(PUSH_TOKEN_KEY, data);
  } catch {
    // Push is optional; the in-app inbox still works.
  }
}

/** Call before signing out so this device stops getting the old account's pushes. */
export async function unregisterForPush() {
  const token = await readSetting(PUSH_TOKEN_KEY);
  if (token) {
    await api.unregisterPushToken(token).catch(() => undefined);
    await AsyncStorage.removeItem(PUSH_TOKEN_KEY).catch(() => undefined);
  }
  if (notificationsSupported) {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    for (const n of scheduled) {
      if (n.identifier.startsWith(REMINDER_PREFIX)) await Notifications.cancelScheduledNotificationAsync(n.identifier);
    }
  }
}

/** Event id carried by a tapped reminder or push, if any. */
export function eventIdFrom(response: Notifications.NotificationResponse | null) {
  const id = response?.notification.request.content.data?.eventId;
  return typeof id === 'string' ? id : null;
}
