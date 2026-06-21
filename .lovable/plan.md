## Root cause

Sync.so rejects every pass with `generation_unknown_error` because the `bounding_boxes_url` JSON has the **wrong frame count** for the actual plate.

| Source | Duration | FPS | Frames |
| --- | --- | --- | --- |
| bbox JSON (uploaded) | 9.000 s (`totalSec` aus Hailuo-Request) | 24 | **216** |
| Tatsächliches MP4 (ffprobe) | 10.125 s | 24 | **243** |

Sync.so's spec ([Speaker Selection — API](https://sync.so/docs/developer-guides/speaker-selection)) ist explizit:

> The number of entries must match the total frame count.

Hailuo liefert für eine 6 s/9 s Anfrage gerne 0.5–1.5 s mehr aus — unser `totalSec` ist die **angeforderte** Dauer, nicht die echte. Der v153.7-Dispatch ist sauber, aber die JSON-Datei wird vom Provider als „invalid" verworfen und in den Generic-Bucket geworfen → `[generation_unknown_error]`.

Vorher hat `bbox-inline` (gleicher Bug) auf kürzeren Plates trotzdem durchlaufen, weil Sync.so dort offenbar laxer geprüft hat. Bei `bbox-url-pro` ist das Length-Match strikt.

## Fix (v153.8 — `actual-frame-count`)

Eine fokussierte Änderung in `supabase/functions/compose-dialog-segments/index.ts`:

1. **Probe the rehosted plate once** — direkt nach `v143_rehost` (vor dem Dispatch der ersten Pass-JSON) wird per `HEAD`+`Range`-Lesefehler oder, einfacher, per `ffprobe`-Mini-Call der Plate-Header gelesen. Da Edge-Functions kein ffprobe haben, nutzen wir stattdessen den **mp4-Box-Parser, der bereits in `compose-dialog-segments` für die Audio-Normalisierung importiert wird** (`parseMp4DurationSec` / Helpers im selben File — siehe `audio_normalization` block). Falls keiner existiert, fügen wir einen kleinen `probePlateFrames(url)` Helper hinzu, der per `Range: bytes=0-65535` die `mvhd`-Box ausliest (Standard-Trick, ~30 Zeilen, keine neue Dependency).
2. **Cache pro Scene** — Ergebnis (`actualDurationSec`, `nbFrames`, `fps`) im bestehenden `passDimsCache`/`plateMetaCache` ablegen, damit alle Passes (1..N) dasselbe `frameCount` benutzen.
3. **`frameCount` ableiten** —
   ```ts
   const fps = probed.fps || ASSUMED_FPS;            // fallback 24
   const frameCount = probed.nbFrames
     ?? Math.max(1, Math.ceil(probed.actualDurationSec * fps));
   ```
   Dieser Wert ersetzt `Math.ceil(totalSec * ASSUMED_FPS)` in **beiden** Call-Sites (Zeile 3732 + 3789, also `bbox-url-pro` und der inline `bbox` Fallback).
4. **Version-Bump** → `COMPOSE_DIALOG_SEGMENTS_VERSION = "v153.8"`.
5. **Neuer Diagnose-Log** vor dem Upload:
   ```
   v153.8_bbox_framecount plate_duration=10.125 plate_fps=24 plate_frames=243 used=243 src=mp4probe
   ```
   Wenn der Probe fehlschlägt, loggen wir `src=fallback_assumed_fps` und nutzen den alten `totalSec*ASSUMED_FPS` — kein Hard-Fail.

## Nicht angefasst

- ASD-Shape (`auto_detect:false` + `bounding_boxes_url`) bleibt unverändert (v140-Wire-Assert + v153.3 Overwrite-Sensor greifen weiter).
- Sync-3 doc-strict Options (`sync_mode`, `active_speaker_detection`) bleiben unverändert.
- Refund-Logik (v5/v129.4a) bleibt unverändert — der Pfad wird nach dem Fix gar nicht mehr getriggert.
- Keine Änderung am v153.7 Coords-Shape-Log (Crash-Fix bleibt drin).

## Verifikation

1. Deploy `compose-dialog-segments` (v153.8).
2. UI → „Sauber neu starten" auf derselben 4-Sprecher-Szene.
3. Log-Check pro Pass:
   - `v153.8_bbox_framecount plate_duration=10.x plate_fps=24 plate_frames=24x used=24x src=mp4probe`
   - `v147_BBOX_URL_PRIMARY ... frames=24x voiced_frames=…`
   - `WIRE_PAYLOAD … bounding_boxes_url=…`
   - `DISPATCH pass=N/4`
   - `sync-so-webhook ... terminal=COMPLETED` (kein `generation_unknown_error` mehr)
4. Fallback-Probe: Wenn `mp4probe` fehlschlägt, soll alter `totalSec*24` Pfad greifen und gelogged werden — vorhandene Refund-Kette bleibt unverändert.

## Erwartetes Ergebnis

Alle 4 Sprecher-Passes laufen bei Sync.so durch, sceneweise Stitch via `poll-dialog-shots` produziert ein einzelnes `clip_url` für die Szene, UI zeigt grünes ✅ statt „Szene fehlgeschlagen".
