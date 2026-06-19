---
name: v131.8 — Pass-Level Watchdog Timeout & Recoverable Late Webhooks
description: Watchdog misst Provider-Timeout pro Pass statt szenenweit; Auto-Retry erhält done-Passes; Late COMPLETED nach watchdog_provider_timeout darf Szene recovern
type: feature
---

## Problem (Forensik 19. Juni 2026, Szene 0c178477…)

- 4-Sprecher-Szene mit Multi-Pass Sync.so.
- Pass 4 wurde um 19:41:01 frisch dispatcht (HTTP 201 von Sync.so).
- `lipsync-watchdog` markierte die Szene um 19:42:03 als `watchdog_provider_timeout` (Auto-Retry-Budget erschöpft).
- Sync.so kam um 19:43:16 mit `COMPLETED` zurück → wurde wegen `lip_sync_status='failed'` ignoriert.
- Ursache: Watchdog hat das **Szenen-Alter** gegen `STALE_PROVIDER_MS` (10 min) gemessen. Bei N≥3 Sprechern ist die Szene bereits >10 min alt, bevor der letzte Pass überhaupt richtig startet.
- Zusatzschaden: v131.7 Auto-Retry setzte `dialog_shots.passes = []`, wodurch bereits fertige Sprecher verloren gingen und das Forensik-Panel `pass_not_found` zeigte.

## Fix v131.8

1. **Pass-Level Liveness** (`supabase/functions/lipsync-watchdog/index.ts`)
   - Bei `hasJob && ageMs > STALE_PROVIDER_MS`: nicht mehr blind failen.
   - Bestimme den jüngsten `rendering`-Pass (`pass.started_at`).
   - Solange irgendein rendering-Pass jünger als `STALE_PROVIDER_MS` ist → warten.
   - Nur wenn ALLE rendering-Passes älter als TTL sind (oder kein rendering-Pass mehr lebt) → `watchdog_provider_timeout`.

2. **Pass-erhaltender Auto-Retry**
   - Statt `passes: []` zu setzen: nur Passes mit `status='rendering'` auf `pending` zurücksetzen, alle `done`-Passes bleiben.
   - `watchdog_retry_attempted` / `watchdog_retry_at` pro Pass speichern.
   - Wenn nichts mehr `rendering` war → Fallback auf alten full-redispatch-Pfad.

3. **Late COMPLETED darf recovern** (`supabase/functions/sync-so-webhook/index.ts`)
   - Wenn Szene wegen `clip_error` startend mit `watchdog_provider_timeout` / `watchdog_auto_retry_` / `watchdog_hard_timeout` failed ist
   - UND der jetzt eintreffende `job_id` in `dialog_shots.passes[]` bekannt ist
   - UND Sync.so `COMPLETED` + `outputUrl` liefert
   - → Szene aus `failed` recovern (`lip_sync_status='running'`, `clip_error=null`, `dialog_shots.status='rendering'`) und normalen v5-Branch weiterlaufen lassen.
   - Echte Sync.so-Failures (provider_unknown_error, generation_pipeline_failed, etc.) bleiben terminal.

## Erwartetes Ergebnis

- Erster Lauf einer 4-Sprecher-Szene scheitert nicht mehr, weil der Watchdog den letzten Pass nach <60s killt.
- Kein Datenverlust mehr: fertige Sprecher überleben den Auto-Retry.
- Selbst wenn Watchdog doch mal zu früh failed, holt der späte erfolgreiche Webhook die Szene zurück.
- Kein neuer Retry-Workaround — der Kunde soll keine 3 Retries / 20 Minuten erleben.

## Regression-Check

- Pass 1 startet bei t=0, Pass 4 erst bei t=11min. Watchdog bei t=12min: Szene bleibt am Leben, weil Pass 4 erst 1 min alt ist.
- Auto-Retry darf `passes[]` weder leeren noch null-Slots erzeugen.
- Late `COMPLETED` Webhook für eine wegen `watchdog_provider_timeout` failed Szene → Recovery + Pass wird als `done` gemerged.
