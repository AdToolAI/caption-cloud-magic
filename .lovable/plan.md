# Lip-Sync Pipeline: Stuck-Recovery & Dispatch-Härtung

## Problem (Root Cause)

Eine Szene hängt seit 16 Min in `lip_sync_status = pending`, `twoshot_stage = master_clip` — aber **kein `syncso_dispatch_log`** und **keine `dialog_dispatch_locks`** Einträge. Sync.so wurde nie kontaktiert. Drei unabhängige Schichten haben versagt:

1. **Client-Auto-Trigger** hält Inflight-Lock zu lange, wenn `compose-dialog-segments` 202 (benign) zurückgibt
2. **Watchdog** überwacht `pending/master_clip + clip_url + ohne dialog_shots` nicht
3. **UI** zeigt „Lip-Sync läuft" obwohl noch nichts dispatched wurde — Stall-Detection blendet sich aus

## Lösung (4 Maßnahmen)

### 1. Client Auto-Trigger Hardening
**Files:** `src/hooks/useTwoShotAutoTrigger.ts`, `src/components/video-composer/ClipsTab.tsx`

- 202-Responses (`already_running`, `scene_lock_busy`, `preflight_transient_retry_later`) als benign behandeln, NICHT als Fehler werten
- Inflight-Lock spätestens nach 30s freigeben (statt auf Response zu warten)
- Re-Trigger erlauben, sobald Lock frei ist und Szene weiterhin `pending/master_clip` ohne `dialog_shots`

### 2. Server Watchdog Erweiterung
**File:** `supabase/functions/lipsync-watchdog/index.ts` (läuft via pg_cron minütlich)

Neue Detection-Regel:
```
scene.lip_sync_status = 'pending'
AND scene.twoshot_stage = 'master_clip'
AND scene.clip_url IS NOT NULL
AND scene.audio_plan->'twoshot'->>'url' IS NOT NULL
AND NOT EXISTS (dialog_shots WHERE scene_id = scene.id)
AND scene.updated_at < NOW() - INTERVAL '3 minutes'
```
→ Re-invoke `compose-dialog-segments` mit `{ auto: true, recovery: true }`. Idempotent via Server-Lock.

### 3. UI Ehrlichkeit
**Files:** `src/components/video-composer/SceneInlinePlayer.tsx`, `src/hooks/usePipelineProgress.ts`

- Status-Labels trennen:
  - `pending + master_clip + KEIN dialog_shots` → „Wird gestartet…" (gelb, max 3 Min)
  - `pending + master_clip + dialog_shots vorhanden` → „Lip-Sync läuft…" (cyan, Provider-Job aktiv)
  - >3 Min in „Wird gestartet" → Banner „Start hängt — neu anstoßen" mit Retry-Button
- Stall-Detection greift wieder für `master_clip` ohne `dialog_shots`

### 4. Backend Konsistenz (optional, leichtgewichtig)
**File:** `supabase/functions/compose-dialog-segments/index.ts`

- Bei `auto: true` + benign wait/retry → konsequent `202 { ok: true, status: "<reason>" }` statt 200/500-Mix
- Keine Credit-Buchung in 202-Pfaden
- Server-Lock-TTL auf max 90s setzen (heute teilweise unklar)

## Validation (nach Implementation)

1. **Manueller Recovery-Test**: Aktuelle stuck Szene `7a6cbf71…` → „Lip-Sync neu rendern" klicken → muss in <2 Min `dialog_shots` Eintrag erzeugen
2. **Race-Test**: Lip-Sync starten → sofort „Neues Projekt" klicken → kein roter Toast, Lock binnen 30s frei
3. **Watchdog-Test**: Test-Szene auf `pending/master_clip` ohne `dialog_shots` setzen, 4 Min warten → Watchdog muss automatisch dispatchen (sichtbar in `syncso_dispatch_log`)
4. **End-to-End**: Frisches Projekt → vollständiger Lip-Sync-Run → entweder erfolgreich oder klarer Fehler, niemals Endlos-Spinner

## Restrisiko (transparent)

- **Sync.so Provider-Outage** (5xx/Timeout extern): Watchdog erkennt, refundet automatisch — User sieht aber Fehlermeldung. Nicht durch diese Maßnahmen verhinderbar.
- **Sub-Minuten-Recovery**: Watchdog läuft min., bei sub-minute hangs greift erst Client-Retry (30s). Akzeptabel.
- **`compose-dialog-segments` Crash (OOM/Deno-Bug)**: Watchdog fängt nach max 3 Min.

## Technische Details

- Memory-Refs: `mem://features/video-composer/dialog-shot-pipeline`, `mem://architecture/lipsync/sync-so-webhook-stage5` (8-min per-shot Watchdog bleibt unverändert)
- Keine DB-Schema-Änderungen
- Keine neuen Secrets
- Cron-Job `poll-dialog-shots-every-minute` bleibt unverändert; `lipsync-watchdog` wird nur erweitert
- Sync.so v3 Integration bleibt wie dokumentiert — kein API-Wechsel nötig, das Problem liegt vor dem Sync.so-Call
