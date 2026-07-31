## Problem

Szene 1 („Hook") ist am HappyHorse-Inhaltsfilter gescheitert, trotzdem läuft der Lip-Sync-Balken los, meldet „Lip-Sync abgebrochen" und startet erneut — Gummiband.

## Was ich verifiziert habe (DB + Code)

- Die betroffene Szene in der DB: `clip_status='failed'`, `clip_error='[green_net_rejected] …'`, `retry_count=3`, `clip_url=NULL`. Die Lip-Sync-Felder sind dort korrekt geleert (`lip_sync_status`/`twoshot_stage` = NULL).
- `compose-dialog-segments` (Server) hat **keinen** Eingangs-Check auf `clip_status='failed'`. Der Dispatcher startet also auch für eine Szene ohne gültige Plate.
- Mehrere Gates im Dispatcher (v117 Plate-Quality, v132 Turn-Visibility, v133 Identity, v153 BBox) setzen bei Ablehnung `clip_status='pending'` + `clip_url=NULL` + `twoshot_stage='needs_clip_rerender'`. Die Szene wird dadurch neu gerendert, scheitert erneut am Green-Net → derselbe Kreislauf.
- Im Client emittiert `useTwoShotAutoTrigger` `lipsync:start`, aber das passende `lipsync:end` kommt nur in bestimmten Fehlerpfaden — bei „stiller" Ablehnung (SILENT_RACE) bleibt der Balken an und flackert beim nächsten Tick wieder los.

Nicht abschließend verifiziert: welcher der beiden Auslöser (Server-Dispatch ohne Gate vs. Client-Retrigger) im konkreten Screenshot zuerst feuert. Deshalb Schritt 1 = Log-Beweis, danach die Fixes.

## Plan

### 1. Beweis aus den Logs (kurz)
`compose-dialog-segments`- und `compose-clip-webhook`-Logs zur betroffenen Szene ziehen und festhalten, welcher Pfad nach dem Green-Net-Fail noch Lip-Sync anstößt.

### 2. Server: Terminal-Fail-Gate in `compose-dialog-segments`
Ganz früh (direkt nach dem Scene-Load, vor jeder Credit-Reservierung):
- Wenn `clip_status='failed'` **oder** kein verwertbarer `clip_url` vorhanden ist → sofort 200/422 mit `error: 'master_clip_failed'` zurück, Lip-Sync-Felder geleert lassen, keine Credits, kein Sync.so-Call, kein Reset auf `pending`.

### 3. Server: Re-Render-Reset nicht mehr blind
Die Gates, die auf `clip_status='pending'` zurücksetzen, bekommen eine Zähl-Grenze: Wenn die Szene bereits ≥2 fehlgeschlagene Clip-Renders hat (`retry_count`) oder der letzte `clip_error` ein Content-Filter-Marker (`[green_net_rejected]`, `E005`) ist, wird **nicht** auf `pending` zurückgesetzt, sondern terminal `clip_status='failed'` mit klarer Meldung („Prompt vom Anbieter-Filter blockiert — bitte Szenentext anpassen"). Damit endet die Schleife.

### 4. Client: Trigger- und Balken-Hygiene
- `useTwoShotAutoTrigger`: Kandidaten-Filter und Audio-Prep-Pfade zusätzlich hart auf `clip_status === 'ready'` prüfen; `master_clip_failed` in die stillen Gründe aufnehmen und dabei **immer** `lipsync:end` emittieren.
- `ClipsTab.tsx`: `clip_status === 'ready'`-Guard vor dem Push in `lipSyncTargets`.
- Watchdog-/Self-Heal-Blöcke (orphanReruns, stalePrep, talking-head-Reset) überspringen Szenen mit `clip_status='failed'`.

### 5. UI
Bei terminal fehlgeschlagener Szene zeigt die Karte nur noch „Szene fehlgeschlagen — Prompt vom Anbieterfilter blockiert" mit Aktion „Prompt anpassen & neu rendern"; kein Lip-Sync-Spinner, kein Fortschrittsbalken.

## Technische Details

- `supabase/functions/compose-dialog-segments/index.ts`: neuer Early-Return-Gate; Reset-Stellen (~L2840, L2997, L3240, L5506) auf terminal-fail umstellen, wenn Content-Filter/Retry-Limit erkannt.
- `src/hooks/useTwoShotAutoTrigger.ts`, `src/components/video-composer/ClipsTab.tsx`, `src/lib/composer/isRealizedScene.ts` (Marker für terminale Content-Filter-Fehler).
- Keine Schema-Änderung, keine Preis-/Credit-Logik-Änderung; Refunds laufen über die bestehenden idempotenten Pfade.
