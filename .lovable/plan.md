## Bestätigte Root Cause
`syncso-preflight/index.ts` ruft MediaPipe nur auf, wenn `plateWidth`, `plateHeight` und `durationSec` aus dem lokalen `parseMp4Head()` kommen. Dieser Parser setzt `width`/`height` **nie** (Felder in `Mp4Info` deklariert, im Parser nicht befüllt) und findet `duration_s` bei Hailuo-Plates (`moov` am Dateiende) oft nicht im 64KB-Head. Pre-Condition immer false → MediaPipe wird übersprungen → Gemini. `REPLICATE_API_KEY` ist gesetzt, also kein zusätzliches Secret-Risiko.

## Fix (v129.21.4)

### 1. `supabase/functions/syncso-preflight/index.ts`
- Import `probeMp4Dims` aus `../_shared/twoshot-face-map.ts` (bestehender 4-Phasen-Prober, produktionserprobt auf Hailuo).
- Vor dem `probeFaceAtFrame(...)`-Aufruf:
  - Falls `mp4Info?.width/height` fehlen → `probeMp4Dims(videoUrl)` aufrufen und Ergebnis als `plateWidth`/`plateHeight` durchreichen.
  - Falls `mp4Info?.duration_s` fehlt → Fallback in dieser Reihenfolge: `audioDurationS` (wird unten ohnehin geparst, einmal vorziehen), dann `pass.duration_seconds`, dann Default `5` (nur als letzter Notnagel).
- In der MediaPipe-Pre-Condition (Zeile 284–290) zusätzlich loggen, **warum** ggf. übersprungen wird, und das Ergebnis als `mediapipe_skipped_reason` in das `face_at_frame` Result schreiben (`missing_video_dims` | `missing_duration` | `no_video_url`). Damit ist ein stiller Gemini-Fallback nie wieder unsichtbar.

### 2. `src/components/admin/SyncsoForensicsSheet.tsx`
- Version-Badge auf `v129.21.4 · mediapipe preconditions fixed` bumpen.
- Falls `face_at_frame.mediapipe_skipped_reason` vorhanden → kleine Diagnose-Zeile darstellen: `MEDIAPIPE SKIPPED: <reason>`.

### 3. Verifikation
- `syncso-preflight` deployen.
- Auf derselben Szene Forensik erneut ausführen.
- Erwartung: `FACE PROBE: MEDIAPIPE` mit `MEDIAPIPE_MS` ~1500–4000ms, `SOURCE = mediapipe`. Falls MediaPipe trotzdem 0 Faces findet → `gemini_fallback` mit beiden MS-Werten (statt heute nur Gemini).

## Nicht enthalten
- Kein Dispatch-Logik-Wechsel (compose-dialog-segments unverändert — nutzt MediaPipe schon korrekt).
- Keine Watchdog-Änderung.
- Kein neuer Provider, keine Schema-Migration.