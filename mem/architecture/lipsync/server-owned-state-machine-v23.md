---
name: Lip-Sync Server-Owned State Machine (v23)
description: Client darf laufende/failed Lip-Sync-Szenen NICHT mehr resetten. Stale-Detection + Refund läuft ausschließlich serverseitig im neuen `lipsync-watchdog` (pg_cron alle 2 min). Reset auf pending nur via expliziter `reset-lipsync-scene` Edge-Function (User-Klick). `hasRecordedProviderJob` erkennt jetzt v4 + v5+shots[] + v5 sync-segments.
type: architecture
---

**Trigger:** Multi-Sprecher-Szenen (3+ Personen) blieben in einem unendlichen
Lip-Sync-Loop hängen. Ursache war ein client-seitiger Stale-Detector in
`useTwoShotAutoTrigger`, der reale, laufende Sync.so-Jobs als „stale"
fehlklassifizierte und die Szene auf `pending` zurücksetzte → neuer Lauf →
alte Jobs orphaned → Ladebalken sprang nie über 0–95% raus.

**Architektur (Juni 2026 / v23):**

- **Client (`useTwoShotAutoTrigger.ts`)** macht ab jetzt KEINE DB-Resets mehr
  für `running`/`failed`. Entfernt: `staleV5`, `staleSyncJobs`, `stale`,
  `preflightAborts`, `zombies`, sowie der `failed → auto-pending` Pfad und
  das pre-invoke `update({lip_sync_status:'pending'})` für failed-Kandidaten.
  Candidate-Filter akzeptiert NUR `pending`/null.
- **`hasRecordedProviderJob` Hardening**: erkennt jetzt v4 shots[], v5+shots[]
  (per-turn aus `compose-dialog-scene`), v5 sync-segments `sync_job_id`,
  passes[] mit `job_id`, plus die alten Indikatoren (`replicate_prediction_id`,
  `twoshot.syncJobs`, `twoshot.heartbeat`). Ohne diese Korrektur galten v5+shots
  Szenen mit aktivem Sync.so-Job fälschlich als „kein Provider-Job".
- **`supabase/functions/lipsync-watchdog/index.ts` (NEU)**: pg_cron alle 2 min
  (`*/2 * * * *`). Findet `lip_sync_status='running'` Szenen ohne
  `lip_sync_applied_at`, älter als TTL, und ruft `failLipSync()` mit Reason
  `watchdog_preflight_aborted` / `watchdog_provider_timeout` /
  `watchdog_hard_timeout`. TTLs: 4 min ohne Provider-Job, 10 min mit
  Provider-Job, 20 min Hard-Cap. Replaced alle Client-Stale-Resets.
- **`supabase/functions/reset-lipsync-scene/index.ts` (NEU)**: JWT-geschützter
  User-Endpoint. Verifiziert Ownership → `failLipSync()` (cancel jobs +
  refund) → hard-reset auf `pending`/null. Einziger erlaubter Weg von
  `failed` zurück in die Pipeline.
- **`useResetLipSync` Hook + UI-Button**: roter „Sauber neu starten"-Button
  in `PipelineProgressBar` sobald `hasFailure` true ist. Ruft den Reset-Endpoint
  auf; danach picked der Auto-Trigger die jetzt-pending Szene auf seinem
  nächsten 8s-Tick als frischen Kandidaten.

**Stuck-Scene-Cleanup**: `07a2a25f-e0e5-4c0b-83b0-f6e4fb02526d` wurde via SQL
auf clean pending zurückgesetzt, alle bekannten Sync.so-Jobs aus
`syncso_inflight_jobs` entfernt.

**Was bewusst unverändert blieb**:
- 1-/2-Sprecher Pfad (`compose-dialog-segments` multi-pass).
- 3-4-Sprecher per-turn Pfad (`compose-dialog-scene` + `poll-dialog-shots`).
- `failLipSync()` Helper, `sync-so-webhook` v4/v5-segments Branches.
- pg_cron `poll-dialog-shots-every-minute` (advance + per-shot retry matrix).

**Resultat**: Failed-Lip-Sync ist terminal. Loop kann nicht mehr entstehen,
weil der Client den Status nicht mehr selbst flippen darf. Server-Watchdog
sorgt für saubere Terminierung in <12 min. Reset ist immer explizit.
