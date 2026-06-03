## Ziel

Den echten Sync.so-Fehler isolieren, anzeigen und je nach Fehlerklasse gezielt reagieren — statt jeden Fehler als „An unknown error occurred" zu sehen.

## Root Cause

Sync.so liefert laut offizieller Webhook-Spec im `FAILED`-Payload zwei klar definierte Felder:

- `error` — menschenlesbare Fehlermeldung
- `error_code` — maschinenlesbarer Code aus einer festen Enum (z.B. `generation_input_audio_invalid`, `generation_pipeline_failed`, `generation_timeout`, `generation_infra_resource_exhausted`, `generation_audio_length_exceeded`, `generation_unhandled_error`)

Unser `extractError` in `sync-so-webhook` liest nur `error_message` / verschachtelte Varianten, aber **nicht** das offizielle Feld `error`. Ergebnis: wir loggen den generischen Fallback-String statt der echten Diagnose, und in `poll-dialog-shots` / `compose-dialog-segments` retryen wir blind, obwohl der Code uns sagen würde, ob Retry überhaupt sinnvoll ist.

## Plan

### 1. Sync.so Webhook richtig parsen (`supabase/functions/sync-so-webhook/index.ts`)

- `extractError(payload)` erweitern um die offiziellen Spec-Felder: `payload.error`, `payload.error_code`, sowie `payload.data?.error` / `payload.data?.error_code` als Fallback.
- Zwei separate Werte zurückgeben: `errorMessage` (string) **und** `errorCode` (string | null).
- Beim Persistieren der fehlgeschlagenen Pass-Row in `dialog_shots` / `dialog_segments` beide Felder speichern (neue Spalte `sync_error_code TEXT`, plus `error_message` für den Text).
- Falls Webhook-Payload trotzdem leer ist (kommt vor): einen GET-Call auf `https://api.sync.so/v2/generate/{job_id}` mit dem `SYNC_API_KEY` machen und Felder dort holen — das ist die offizielle Recovery-Methode.

### 2. Fehlercode-Klassifizierung (neuer Helper `_shared/syncSoErrorPolicy.ts`)

Eine zentrale Funktion `classifySyncError(code)` mit drei Buckets:

| Bucket | Codes | Aktion |
|---|---|---|
| `retry_transient` | `generation_timeout`, `generation_infra_resource_exhausted`, `generation_infra_service_unavailable`, `generation_infra_storage_error`, `generation_database_error`, `generation_pipeline_failed`, `generation_unhandled_error` | Exponential Backoff, max 2 Retries auf demselben Pass |
| `retry_with_repair` | `generation_input_audio_invalid`, `generation_media_metadata_missing` | Audio einmalig über ffmpeg neu encoden (`pcm_s16le`, sauberes WAV-Header) und genau 1× retryen |
| `fail_fast` | `generation_audio_length_exceeded`, `generation_unsupported_model`, `generation_text_length_exceeded`, `generation_audio_missing`, `generation_video_missing` | Sofort als endgültig fehlgeschlagen markieren, Credit-Refund triggern, Code in UI surfacen |

Unbekannte Codes → wie `retry_transient` (1 Retry), danach als `fail_fast` mit Code im Fehlertext.

### 3. Pass-Dispatch & Polling anpassen

- `sync-so-webhook`: bei `FAILED` Bucket bestimmen → bei `retry_*` Pass auf `pending` zurücksetzen und Retry-Counter inkrementieren statt sofort die ganze Szene zu kippen.
- `poll-dialog-shots` / `compose-dialog-segments`: Retry-Counter (`sync_retry_count`) respektieren, max 2, danach Szene als `failed` mit dem klaren Code im `error_message`.
- Bei `retry_with_repair`: vor dem nächsten Dispatch das WAV durch eine kleine `repairAudio()`-Routine schicken (FFmpeg via vorhandene Stack, gleiches Pattern wie in `poll-dialog-shots` `normalize_failed`-Pfad).

### 4. UI: Fehlercode anzeigen

- In der Szenen-Karte / Dialog-Shot-Statusanzeige zusätzlich zum „failed"-Badge den `sync_error_code` und eine 1-zeilige menschenlesbare Erklärung anzeigen (Mapping aus `classifySyncError`-Helper).
- So sieht der User direkt z.B. „`generation_pipeline_failed` — Sync.so-Pipeline-Fehler, Retry läuft (2/2)" statt „An unknown error occurred".

### 5. Backfill der aktuell fehlgeschlagenen Szenen

- Einmal-Skript (oder Edge-Function `lipsync-watchdog`-Erweiterung) das alle `dialog_shots` mit `status='failed'` der letzten 24h nimmt, deren `job_id` per GET an Sync.so abfragt und `sync_error_code` nachträgt — damit wir endlich datenbasiert sehen, ob die 3-Sprecher-Failures wirklich alle `generation_pipeline_failed` sind oder z.B. `generation_input_audio_invalid` (was Audio-Repair als Lösung bestätigen würde).
- Szene `6d00a2b8…` und die anderen aktuell roten Szenen werden anschließend auf `pending` resettet (ohne neuen Credit-Abzug) und durchlaufen den neuen Pfad.

## Betroffene Dateien

- `supabase/functions/sync-so-webhook/index.ts` — Parser + Retry-Routing
- `supabase/functions/poll-dialog-shots/index.ts` — Retry-Counter + Audio-Repair-Pfad
- `supabase/functions/compose-dialog-segments/index.ts` — gleiche Retry-Logik
- `supabase/functions/_shared/syncSoErrorPolicy.ts` (neu) — Klassifizierung
- `supabase/functions/lipsync-watchdog/index.ts` — Backfill-Endpoint
- DB-Migration: `dialog_shots.sync_error_code TEXT`, `dialog_shots.sync_retry_count INT DEFAULT 0` (analog für `dialog_segments`)
- Frontend: Dialog-Shot-Status-Komponente (1 Komponente in `src/components/`-Composer-Bereich) für Code-Anzeige

## Warum das das eigentliche Problem löst

Sobald wir den echten `error_code` haben, brauchen wir nicht mehr zu raten ob 3-Sprecher-Plates das Provider-Modell überfordern (`generation_pipeline_failed` → Provider-Issue, Retry hilft) oder ob unser WAV mit dem Lead-In fehlerhaft ist (`generation_input_audio_invalid` → Audio-Repair behebt es deterministisch). Erst dann wissen wir, ob Routing-Umbau (poll-dialog-shots-Pfad) überhaupt nötig ist oder ob Audio-Repair + Retry reicht.
