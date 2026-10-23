// Sends an Expo push for every new row in public.notifications.
//
// Wire it up in the Supabase dashboard: Database > Webhooks > Create webhook on
// INSERT into public.notifications, type "Supabase Edge Function", function
// send-push, with an HTTP header `x-webhook-secret` equal to the
// PUSH_WEBHOOK_SECRET secret (see README, "Push notifications").
import { createClient } from 'npm:@supabase/supabase-js@2';

type NotificationRow = {
  id: string;
  user_id: string;
  title: string;
  body: string;
  event_id: string | null;
  society_id: string | null;
};

type ExpoTicket = { status: 'ok' | 'error'; details?: { error?: string } };

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

Deno.serve(async (req) => {
  const secret = Deno.env.get('PUSH_WEBHOOK_SECRET');
  if (!secret || req.headers.get('x-webhook-secret') !== secret) {
    return new Response('Unauthorized', { status: 401 });
  }

  const payload = await req.json();
  const n = payload?.record as NotificationRow | undefined;
  if (payload?.type !== 'INSERT' || !n?.user_id) return Response.json({ skipped: true });

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: tokens, error } = await supabase.from('push_tokens').select('token').eq('user_id', n.user_id);
  if (error) return new Response(error.message, { status: 500 });
  if (!tokens?.length) return Response.json({ sent: 0 });

  const messages = tokens.map((t) => ({
    to: t.token,
    title: n.title,
    body: n.body,
    sound: 'default',
    channelId: 'reminders',
    data: { eventId: n.event_id, societyId: n.society_id, notificationId: n.id },
  }));

  const accessToken = Deno.env.get('EXPO_ACCESS_TOKEN');
  const res = await fetch(EXPO_PUSH_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify(messages),
  });
  if (!res.ok) return new Response(`Expo push failed: ${res.status}`, { status: 502 });

  // Forget devices that uninstalled the app or turned notifications off.
  const tickets = ((await res.json()).data ?? []) as ExpoTicket[];
  const dead = tickets.flatMap((t, i) => (t.status === 'error' && t.details?.error === 'DeviceNotRegistered' ? [tokens[i].token] : []));
  if (dead.length) await supabase.from('push_tokens').delete().in('token', dead);

  return Response.json({ sent: messages.length, removed: dead.length });
});
