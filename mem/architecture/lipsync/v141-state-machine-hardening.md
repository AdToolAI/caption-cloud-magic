---
name: Lipsync v141 State-Machine Hardening
description: Watchdog + webhook no longer destroy completed passes; late Sync.so webhooks reattach via dispatch log; watchdog scans pending+syncso_fanout_* zombie state.
type: feature
---

# v141 — State-Machine Hardening (2026-06-20)

## Symptom

4-Sprecher-Szene blieb 24 min auf 95% mit `lip_sync_status=pending`,
`twoshot_stage=syncso_fanout_3_of_4`. 3/4 Provider-Pässe fertig, Pass 2 auf
`pending` ohne `job_id`, Sync.so-Webhook hatte den Original-Job vorher als
ORPHAN abgewiesen. `lipsync-watchdog` scannte 0.

## Root Cause (drei Bugs zusammen)

1. **Watchdog Auto-Retry** setzte `rendering`-Pass auf `pending`, obwohl
   der Provider-Job kurze Zeit später noch erfolgreich zurückkam.
2. **Webhook Orphan-Reject** verwarf den späten Completed-Webhook, weil
   `job_id` aus `passes[]` gelöscht worden war.
3. **Watchdog-Filter** kannte den Zustand `pending + syncso_fanout_*`
   nicht — die Zombie-Szene wurde nicht weitergescannt.

## Fix

- `lipsync-watchdog`:
  - Filter erweitert um `syncso_fanout_%`, `syncso_retry_%`,
    `syncso_fanout_recovering`, `audio_muxing`.
  - Auto-Retry pollt **vor** dem Reset jeden `rendering`-Job. COMPLETED
    → Webhook-Forward, kein Reset.
  - Reset überspringt jeden Pass mit `output_url` oder Status
    `done`/`done_suspect`/`failed`/`canceled_by_scene_failure`.
- `sync-so-webhook`:
  - Bei orphan job_id: Lookup in `syncso_dispatch_log`, falls Pass dort
    gefunden und noch ohne `output_url`, wird die job_id reattacht und
    der Webhook normal verarbeitet.

## Files

- `supabase/functions/lipsync-watchdog/index.ts`
- `supabase/functions/sync-so-webhook/index.ts`

## Invariant

Ein Pass mit `output_url` ist terminal. Nichts (Watchdog, Retry,
Recovery) darf ihn jemals auf `pending`/`rendering` zurücksetzen.
