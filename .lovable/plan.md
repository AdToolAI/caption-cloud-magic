## Diagnose

**Do I know what the issue is?** Ja.

Der fehlgeschlagene Run ist Szene `5f43e669-b154-4ac9-a516-b46acb7ee288`. Die Logs zeigen:

- Alle 3 Sprecher-Passes laufen in die Sync.so-Fehlermeldung `An unknown error occurred.` ohne `error_code`.
- Die Payloads nutzen weiter den alten Hybrid:
  - `input[0].segments_secs=[[...]]` auf dem Video
  - ein einzelnes Audio ohne `refId`
  - globale `options.active_speaker_detection`
  - pro Sprecher separate Retries mit Tight-WAV / Repair-WAV
- Bei Pass 3 fällt v39/v40 sogar wieder in `v39_tight_audio_failed: offset is out of bounds` zurück und sendet danach `full-length WAV + segments_secs`.

Die offizielle Sync.so-Doku sagt inzwischen klar etwas anderes:

- Multi-Speaker soll über **top-level `segments[]`** laufen.
- Jedes Audio bekommt ein eigenes `refId` im `input`.
- Jedes Segment nutzt `audioInput: { refId, startTime, endTime }`.
- Jeder Sprecher bekommt im Segment `optionsOverride.active_speaker_detection` mit `frame_number + coordinates` oder `bounding_boxes`.
- Für komplexe Multi-Person-/statische Szenen ist `sync-3` der robusteste Qualitätsmodus.

Zusätzlich ist in unserem Code ein alter Kommentar/Annahmeblock falsch geworden: `compose-dialog-segments` behauptet noch, es gäbe keine per-segment ASD-Felder. Die aktuelle Sync.so-Doku bestätigt aber genau diese Felder.

## Plan

### 1. v41 Official Multi-Speaker Engine für 3+ Sprecher

In `supabase/functions/compose-dialog-segments/index.ts` baue ich für Szenen mit mindestens 3 Sprechern einen neuen Dispatch-Pfad:

```text
POST /v2/generate
model: sync-3
input:
  - full scene video
  - audio_1 full-length speaker WAV
  - audio_2 full-length speaker WAV
  - audio_3 full-length speaker WAV
segments:
  - startTime/endTime
  - audioInput.refId + audio crop window
  - optionsOverride.active_speaker_detection für genau diesen Sprecher
options:
  - sync_mode: cut_off oder loop/bounce nur wenn Segmentlänge es verlangt
```

Wichtig: Kein `segments_secs` mehr, keine Tight-WAVs mehr, kein erneutes Audio-Slicing, keine per-speaker Provider-Kette für 3+.

### 2. Offizielle Face-Selection erzwingen

Ich entferne für 3+ Sprecher die riskante `face-gate SOFT-PASS`-Abkürzung. Stattdessen gilt:

- `frame_number + coordinates` müssen aus der echten Scene-Plate stammen, nicht nur aus dem Anchor-Bild.
- Wenn die echten Plate-Frames kein Gesicht am Zielpunkt enthalten, fail-fast mit Refund und klarer Meldung: Szene neu rendern mit sichtbaren Gesichtern.
- Optional vorhandene Bounding-Boxes werden nur verwendet, wenn sie wirklich zur Plate-Frame-Geometrie passen.

### 3. Retry-Ladder vereinfachen

In `supabase/functions/sync-so-webhook/index.ts` trenne ich den neuen v41-Pfad vom alten v5-Fanout:

- v41 hat nur eine Provider-Generation für die ganze Szene.
- Bei Sync.so `FAILED/REJECTED`:
  - echte `error_code`s werden geloggt und geroutet
  - transiente Fehler bekommen maximal einen idempotenten Retry
  - kein Wechsel auf `auto-pro`/`auto-standard`
  - keine Tight-WAV/Repair-WAV-Kette
  - bei finalem Fehler automatische Rückerstattung

### 4. Compositor nur noch für Legacy/Fanout

`render-sync-segments-audio-mux` bleibt für alte/in-flight Fanout-Rows erhalten, wird aber für v41 nicht benötigt:

- Sync.so liefert bereits ein komplettes Video mit allen Sprechersegmenten.
- Der Webhook setzt `clip_url`, `lip_sync_status='applied'`, `lip_sync_applied_at` direkt.

### 5. State sauber versionieren

`dialog_shots` bekommt einen neuen klaren State, z. B.:

```text
version: 41
engine: sync-official-segments
status: rendering | done | failed
sync_job_id
segments
audio_inputs
speaker_targets
model: sync-3
```

Damit kollidieren neue Runs nicht mit alten v5/v39/v40-Feldern wie `audio_tight`, `audio_url_full`, `passes[]`.

### 6. Reset der betroffenen Szene

Nach dem Code-Fix wird Szene `5f43e669-b154-4ac9-a516-b46acb7ee288` sauber zurückgesetzt:

- `dialog_shots = null`
- `lip_sync_status = pending`
- alte Sync.so Job-IDs werden ignoriert/canceled, soweit möglich
- Credits bleiben geschützt durch idempotente Refund-Logik

### 7. Verifikation

Ich prüfe danach:

- Logs enthalten `v41_official_segments_payload`.
- Payload enthält `segments[]`, `audioInput.refId`, `optionsOverride.active_speaker_detection`.
- Es gibt keine `v39_tight_audio_failed` Logs mehr.
- Es gibt keine `segments_secs` im Sync.so Payload für 3+ Sprecher.
- Bei Erfolg wird die Szene direkt als angewendet markiert, ohne Fanout-Mux.
- Bei Fehler erfolgt automatischer Refund und eine klare, technische Diagnose statt nur `An unknown error occurred.`.

## Dateien

- `supabase/functions/compose-dialog-segments/index.ts`
- `supabase/functions/sync-so-webhook/index.ts`
- optional `supabase/functions/render-sync-segments-audio-mux/index.ts` nur für Legacy-Guard/Logs
- Memory-Dokumentation für v41
- einmaliger Reset der betroffenen Szene nach Deployment

## Warum das der richtige Wechsel ist

Die bisherigen Fixes haben Symptome an einer selbstgebauten Pipeline repariert. Der aktuelle Fehler zeigt, dass die Pipeline grundsätzlich zu fragil ist: Tight-WAVs, `segments_secs`, separate Sprecherjobs und spätes Mask-Compositing kämpfen gegen Sync.so statt mit Sync.so. v41 stellt den 3-Sprecher-Fall auf den offiziell dokumentierten Multi-Speaker-Mechanismus um.