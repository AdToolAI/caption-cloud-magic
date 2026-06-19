---
name: v131.7 — Watchdog Auto-Retry + Realtime Merge Fix
description: Sync.so watchdog_provider_timeout retries 1× automatisch statt sofort hard-fail; Composer-Dashboard Realtime-Merge übernimmt ab v131.7 clip_error/dialog_shots/replicate_prediction_id DB-first; SceneInlinePlayer hat 9-min Stale-Backstop falls Realtime einen Tick verschluckt.
type: feature
---

# v131.7 — Watchdog Auto-Retry + UI Stale-Backstop

## Problem
Sync.so liefert für Single-Face-Preclips manchmal HTTP 201 + job_id, dann
~10 min nichts (Webhook leer, GET-Polling leer). `lipsync-watchdog`
hat das bis v131.6 sofort als `watchdog_provider_timeout` terminal-failed +
refund. User sah trotzdem „Lip-Sync läuft…" weil:

- `refetchScenesFromDb` in `VideoComposerDashboard.tsx` hat `clip_error` und
  `dialog_shots` nicht in den lokalen Scene-State gemerged, und
  `replicate_prediction_id` mit `local?.replicatePredictionId` als Fallback
  → stale `sync:…`-ID hat den DB-Reset (NULL) überschrieben → `lipsyncRunning`
  blieb true.
- Bei verschlucktem Realtime-Tick (Edge Case) gab es überhaupt keinen
  zeitlichen Backstop in der UI.

## Fix

### Backend — `supabase/functions/lipsync-watchdog/index.ts`
Vor dem `failLipSync(reason='watchdog_provider_timeout')`-Call:
1. Prüfe `dialog_shots.watchdog_retries ?? 0`.
2. Wenn `< 1`:
   - Bestehende Sync.so-Jobs cancellen (`POST /generations/{id}/cancel`) +
     `releaseInflightSyncJob`.
   - `composer_scenes` Reset: `lip_sync_status='pending'`,
     `twoshot_stage='master_clip'`, `replicate_prediction_id=null`,
     `dialog_shots.watchdog_retries=1`, `passes=[]`,
     `recovery_dispatched_at=null`, `clip_error='watchdog_auto_retry_1_of_1'`.
   - Skip `failLipSync`. Der nächste Cron-Tick triggert
     `dispatch-recovery` → frischer Sync.so-Dispatch.
3. Wenn `>= 1`: regulärer terminal-fail + refund.

### Frontend — `VideoComposerDashboard.tsx` (`refetchScenesFromDb`)
DB-first für ALLE Lifecycle-Felder:
- `clipError: row.clip_error ?? null` (war nicht gemapped)
- `dialogShots: row.dialog_shots ?? null` (war nicht gemapped)
- `replicatePredictionId: row.replicate_prediction_id ?? null`
  (war `?? local?.replicatePredictionId` → stale-leak)

### Frontend — `SceneInlinePlayer.tsx`
Neuer `lipsyncStaleByAge`-Check: wenn `audio_plan.twoshot.first_started_at`
>9 min alt ist und `lip_sync_applied_at` weiterhin null → behandle Szene als
`isFailed`. Backstop für verschluckte Realtime-Ticks.

## Was unverändert bleibt
- v131.5 ASD-Mutex + Dispatch-Override
- v131.6 Anchor Auto-Recovery
- Credit-Refund-Pfad bei finalem Fail (greift erst nach Retry-Exhaustion)
- HEURISTIC_BLOCKED-Logik (hat schon 3 Eigenversuche)

## Verifikation
1. Szene mit `lip_sync_status='failed'`, `twoshot_stage='failed'`,
   `clip_error='watchdog_provider_timeout'` zeigt sofort rotes „✕ Fehler" +
   „Re-Render"-Button — kein endloser Spinner.
2. Nächste Sync.so-Hänger werden 1× automatisch retried; Erfolgsquote
   im Backend-Log via `dialog_shots.watchdog_retries` messbar.
3. Bei 2. Hänger derselben Szene: regulärer Refund + terminal fail
   (kein Endlos-Retry-Budget).
