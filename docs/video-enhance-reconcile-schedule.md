# Video Enhance — reconcile schedule

The edge function `video-enhance-reconcile` finishes runs that lost their
client (poll timeouts, late provider output, late cost readings). It is
invoked every five minutes by a pg_cron job. This file is the canonical,
re-runnable definition of that job; the repository migration
`video-enhance-reconcile-5min` carries the identical statement.

## Why the publishable key, and why that is safe

The job authenticates with the project's PUBLISHABLE (anon) key — the same
key that ships in the app bundle. No privileged secret is embedded in the
cron command or in the repository (`app.settings.service_role_key` is not
configured in this project and must not be).

The endpoint is therefore treated as reachable by anyone and is hardened for
that in `supabase/functions/_shared/video-enhance-reconcile-guard.ts`:

- a user JWT is rejected — only anon / service-role Bearer or a matching
  `x-cron-secret` pass;
- the request body is never read, so no caller can select rows;
- the response holds counters only — never run or user data;
- every unit of work is gated by per-run timestamps the reconciler advances
  itself (`next_reconcile_at`, `next_late_check_at`), so a second call right
  behind the first finds nothing due and costs a handful of indexed queries —
  never provider traffic;
- an in-isolate throttle (`MIN_CYCLE_INTERVAL_MS = 30 s`) and an in-flight
  guard collapse bursts on top.

Optional tightening: set a `CRON_SECRET` function secret and add
`"x-cron-secret": "<value>"` to the headers below. The guard then still
accepts the anon key (the schedule keeps working during the switch); remove
the anon acceptance from the guard once the header is live.

## Statement (idempotent)

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
begin
  perform cron.unschedule('video-enhance-reconcile-5min');
exception
  when others then
    null; -- job did not exist yet
end
$$;

select cron.schedule(
  'video-enhance-reconcile-5min',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url:='https://lbunafpxuskwmsrraqxl.supabase.co/functions/v1/video-enhance-reconcile',
    headers:='{"Content-Type": "application/json", "apikey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxidW5hZnB4dXNrd21zcnJhcXhsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAxMjA3NzUsImV4cCI6MjA3NTY5Njc3NX0.gRvY8kUzrELzlhSdGNJj_CXsaT8mqaUO7F1jCEi2T7Y", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxidW5hZnB4dXNrd21zcnJhcXhsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAxMjA3NzUsImV4cCI6MjA3NTY5Njc3NX0.gRvY8kUzrELzlhSdGNJj_CXsaT8mqaUO7F1jCEi2T7Y"}'::jsonb,
    body:='{"trigger":"cron"}'::jsonb
  );
  $$
);
```

## Verifying

```sql
select jobid, jobname, schedule, active from cron.job where jobname = 'video-enhance-reconcile-5min';
select status, return_message, start_time
  from cron.job_run_details
 where jobid = (select jobid from cron.job where jobname = 'video-enhance-reconcile-5min')
 order by start_time desc limit 10;
```

A healthy run returns `200` with a JSON body of counters
(`{"ok":true,"processed":n,"stale":n,"late_cost_checked":n,...}`).

The static test `src/test/videoEnhanceReconcileSchedule.test.ts` asserts that
this statement stays idempotent, targets the right function, and carries no
key with a role other than `anon`.
