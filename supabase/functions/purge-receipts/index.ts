// Daily housekeeping for payments: deletes payment screenshots that have done
// their job, and frees event places held by tickets nobody paid for in time.
// Which screenshots go is decided in the database (public.receipts_to_purge):
// 30 days after the payment is confirmed, 7 days after a cancellation or
// rejection, 90 days at most, and a day for uploads never linked to anything.
//
// Schedule it once a day (see README, "Payments and receipts"), calling it with
// an HTTP header `x-cron-secret` equal to the CRON_SECRET secret.
import { createClient } from 'npm:@supabase/supabase-js@2';

const BATCH = 500;

Deno.serve(async (req) => {
  const secret = Deno.env.get('CRON_SECRET');
  if (!secret || req.headers.get('x-cron-secret') !== secret) {
    return new Response('Unauthorized', { status: 401 });
  }
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  const released = await supabase.rpc('release_expired_tickets');
  if (released.error) return new Response(released.error.message, { status: 500 });

  let deleted = 0;
  // Batches until nothing is left; stop early if a batch makes no progress.
  for (let round = 0; round < 20; round++) {
    const { data: paths, error } = await supabase.rpc('receipts_to_purge', { p_limit: BATCH });
    if (error) return new Response(error.message, { status: 500 });
    const list = (paths ?? []) as string[];
    if (!list.length) break;
    const removed = await supabase.storage.from('receipts').remove(list);
    if (removed.error) return new Response(removed.error.message, { status: 500 });
    const forgot = await supabase.rpc('forget_receipts', { p_paths: list });
    if (forgot.error) return new Response(forgot.error.message, { status: 500 });
    deleted += list.length;
    if (list.length < BATCH) break;
  }

  return Response.json({ deleted, eventsReleased: released.data });
});
