# Root Cause + Pipeline-Vergleich mit Sync.so Docs

## Was Sync.so wirklich erwartet (Docs)

| Bereich | Empfehlung Docs | Was wir tun |
|---|---|---|
| **Multi-Face Targeting** | `bounding_boxes` **per Frame** als Array oder `bounding_boxes_url` zu JSON-Datei (eine Box pro Frame oder `null`). Sync-3 verarbeitet die **volle Plate** mit nativem Multi-Face/Profile/Occlusion-Support. | Wir bauen **Preclips** (Lambda-Render eines 512×512-Crops um den Mund) und schicken `frame_number`+`coordinates` auf diesen Mini-Clip. Das ist die teure manuelle Variante eines Problems, das sync-3 nativ löst. |
| **Audio-Video-Dauer** | Sollen "close to each other" sein; `cut_off` trimmt Audio aufs Video. | Wir schicken 9s Plate + 2.25s tight-WAV → Sync.so cuttet Audio auf 2.25s. OK, aber redundant gegenüber dem Plate-Window. |
| **Audio-Encoding** | Bei `generation_input_audio_invalid`: `ffmpeg -c:a pcm_s16le`. | Wir re-encoden bereits per Webhook-Retry (`repair_audio`). |
| **Multi-Speaker** | Offizieller Weg: **Segments API** — eine Plate, mehrere Audio-Tracks mit Zeitfenstern + speaker-target. | Wir machen **N getrennte Sync.so-Calls** (1 pro Sprecher-Turn) + Lambda-Stitcher. |
| **`auto_detect`** | `false` ist korrekt, wenn manuelle Auswahl. | ✅ |

**Sync.so-Fehler "An unknown error occurred"** = `generation_unhandled_error` oder `generation_pipeline_failed`. Beides sind Catch-Alls. In unserem Fall korreliert er mit Pass 0 nach dem v77-`face_gate_BLOCK` (faces=0 im Preclip) → Fallback auf "full-plate dispatch with plate coords" → der Preclip-Pfad und der Full-Plate-Pfad mischen sich, und die `frame_number=27` zeigt auf einen Frame, der im wirklich gesendeten Video nicht existiert. Sync.so kann den Speaker nicht resolven → Pipeline-Fail.

## Was wir ändern (Root-Cause-Fix + Speedup)

### A. Preclip-Pfad fallenlassen, **`bounding_boxes_url` mit voller Plate** verwenden (Architektur-Fix)
- Beim Plate-Face-Detect (haben wir bereits per Gemini) generieren wir **eine JSON-Datei pro Sprecher** mit einem Box-Array über alle Frames der Plate. Für die Frames, in denen der gewünschte Sprecher spricht: seine Box. Für alle anderen Frames: `null` (Sync-3 lässt diese Frames unverändert).
- Upload nach Storage (`face-bbox` Bucket), URL im Payload.
- Payload pro Pass:
  ```json
  { "model": "sync-3",
    "input": [
      { "type": "video", "url": "<volle Plate, NICHT preclip>" },
      { "type": "audio", "url": "<full audio mit Silence-Padding statt tight>" }
    ],
    "options": {
      "sync_mode": "cut_off",
      "active_speaker_detection": {
        "auto_detect": false,
        "bounding_boxes_url": "<bbox-json für diesen Sprecher>"
      }
    }
  }
  ```
- **Konsequenz:** Lambda-Preclip-Render entfällt (~67 s gespart pro Runde). Lambda-Stitcher entfällt teilweise — Sync-3 liefert direkt die volle Plate mit dem Mund-Override für die richtigen Frames; wir müssen nur noch die N Outputs der N Sprecher per ffmpeg `overlay` zusammenfassen (oder, wenn die Sprecher zeitlich disjunkt sind, die Sprecher-Segmente trimmen+concat statt overlay).
- **Sync.so-Fehlerquote** fällt drastisch, weil wir den nativen Sync-3-Pfad nutzen (für den die Doku ausdrücklich Multi-Face + Profile + Occlusion garantiert) statt unseren fragilen Crop-Workaround.

### B. Vorbereitungs-Phase parallelisieren (Speedup für die verbleibende Pipeline)
1. **Face-Gate Repair parallel** (`Promise.all` statt 4× seriell Gemini) → ~40 s gespart.
2. **Bbox-JSON-Generierung parallel** für alle Sprecher (rein lokal aus dem bereits gecachten Gemini-Result) → quasi instant.

### C. UI-Status ehrlich
Wenn ein Pass im Status `retrying` ist, im Clip-Overlay statt "Lip-Sync wird gestartet…" anzeigen: "Sync.so-Fehler — Neuversuch X/3 läuft". Reines Frontend.

## Technische Punkte
- Dateien:
  - `supabase/functions/compose-dialog-segments/index.ts` (Bbox-JSON-Builder, neuer Payload, Entfernen des Preclip-Calls auf dem Happy-Path)
  - `supabase/functions/_shared/` (neue `bboxJson.ts` Helper)
  - Stitcher-Edge-Function für N-Output-Merge (entweder neue `stitch-bbox-outputs` oder bestehende `compose-dialog-stitch` anpassen)
  - Frontend: Clip-Karten-Overlay
- Storage-Bucket: `dialog-bbox` (RLS: user-id als erstes Path-Segment, gemäß Core-Regel)
- Preclip-Pfad bleibt als **Fallback** unter Flag `composer.dialog_use_preclip` (default `false`) erhalten — kein Big-Bang, wir können A/B testen.
- v96 Force-Repair bleibt erhalten (Coords werden für die Bbox-Berechnung weiterhin gebraucht).
- Plan-D Parallel-Cap (4) bleibt unverändert.

## Erwartung
| Phase | Heute | Nach Fix |
|---|---|---|
| Face-Detect + v96 Repair | ~70 s seriell | ~15 s parallel |
| Lambda-Preclip-Render | ~67 s seriell | **entfällt** |
| Sync.so Dispatch + Run | ~3 min (mit 1 Retry) | ~1:30 min (kaum Retries) |
| Stitcher | ~10 s | ~10 s |
| **Wallclock 4 Sprecher** | **~9:20 min** | **~2:30 min** |

## Verifizierung
- Nächste 4-Sprecher-Szene: keine `Preclip Lambda renderId` mehr, dafür 4 Bbox-JSON-URLs im DB-`passes[]`.
- Sync.so-Webhook: 0 `FAILED` Events in 10 aufeinanderfolgenden Runs.
- Wallclock-Telemetrie unter 3 min für ≥4 Sprecher.

## Rollback
Flag `composer.dialog_use_preclip = true` → zurück auf bestehende Pipeline.