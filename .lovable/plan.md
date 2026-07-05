# Root Cause bestätigt — kein v183/Mapping-Bug, sondern v124 `buildPerFrameBoxes` in Kombination mit später Turn-Position

Deine Theorie war goldrichtig: die **Pipeline funktioniert grundsätzlich**, Sync.so's Face-Detector rejected nur den 3. Pass. Ich habe die tatsächlich hochgeladenen `bounding_boxes_url` JSONs der fehlgeschlagenen Szene inspiziert:

## Beweis aus den Bbox-Dateien (Scene `3d5298b3…`)

| Pass | Speaker | Bbox-Datei-Inhalt | Sync.so |
|------|---------|-------------------|---------|
| 0 (P1) | Samuel | `[236,206,485,510]` auf **allen** Frames (Full-Fill) | ✅ DISPATCHED |
| 1 (P2) | Matthew | `[234,169,485,483]` auf **allen** Frames (Full-Fill) | ✅ DISPATCHED |
| 2 (P3) | Sarah | **null für die ersten ~120 Frames**, danach `[1256,177,1449,417]` | ❌ REJECTED `face_detection` |

Damit ist die Sache eindeutig:
- **Kein v183-Identity-Bridge-Bug**: die Boxen sind auf drei verschiedenen Positionen, kein Mapping-Swap.
- **Kein Auto-Detect-Problem**: alle drei Passes senden `auto_detect: false` + `bounding_boxes_url` (v169-konform).
- **Kein Rekognition-Off-by-frame**: Sarahs Box (`x=1256`) sitzt rechts im Bild, plausibel für den rechten Speaker.
- **Der Fehler ist**: Sync.so's Face-Selection-Validator schaut auf den **ersten Frame** des Videos, um die Speaker-Face zu verifizieren. Bei Sarah ist dort `null` (sie spricht erst ab ~Frame 120 = ~5 s in 24 fps). Sync.so kann kein Gesicht in einem null-Frame validieren → `generation_input_face_selection_invalid`.

Warum P1/P2 durchgehen: sie kriegen den **Full-Fill-Pfad** (Zeile 366 in `compose-dialog-segments/index.ts`) — entweder weil ihre `voicedWindowsSec` leer war oder weil ihre erste Turn schon bei t≈0 beginnt. Sarah bekommt den v124-Windowed-Pfad mit führenden Nulls.

## v169-Kompatibilität

Das ist **kein** Regressionsbug seit v169. Der v124-Code existiert seit vor v169 und wurde durch v169's Anchor-Bridge nur überdeckt, weil damals der Face-Anchor-Frame bei einem non-null Frame lag. Heute schickt Sync.so implizit Frame 0 als Validation-Frame und der ist null → Reject.

**v169-Invarianten bleiben unangetastet**: kein `auto_detect`, keine neue Retry-Ladder, keine Model-Swaps, keine Segmente ohne bbox_url, keine Mapping-Änderung.

## Der Fix (surgical, ein Block in `compose-dialog-segments/index.ts`)

### Option 1 (bevorzugt, minimal) — führende Nulls in `buildPerFrameBoxes` mit der Speaker-Box füllen

In `buildPerFrameBoxes` nach dem Zusammenbau des `out`-Arrays:

```ts
// v186 — Sync.so's face-selection validator inspects the head of the
// bounding_boxes array to confirm the selected face exists. A leading run
// of `null` (speaker's first turn starts mid-clip) trips
// `generation_input_face_selection_invalid`. Backfill leading nulls up to
// the first voiced window with the same static box — the speaker is
// still visually present on the plate, they're just silent.
const firstVoicedFrame = windows[0][0];
for (let i = 0; i < firstVoicedFrame; i++) out[i] = params.box;
```

Wichtig: **nur führende Nulls** werden gefüllt. Zwischen-Nulls (Speaker A spricht, dann pausiert, dann Speaker B, dann wieder A) bleiben `null` — genau wie v124 vorgesehen hat, damit Sync.so nicht die falschen Münder animiert.

### Option 2 (Fallback wenn Option 1 nicht reicht) — Trailing Nulls symmetrisch behandeln

Falls Sync.so auch am Videoende validiert: gleiches Backfill vom letzten voiced frame bis `frameCount-1`. Standardmäßig NICHT machen — nur wenn Option 1 nicht reicht.

## Verifikation

1. Nur die eine fehlgeschlagene Szene neu rendern (`3d5298b3…` Pass 2 / Sarah).
2. Erwartetes Log:
   - Neue `syncso_dispatch_log`-Zeile für Pass 2 mit `sync_status=DISPATCHED`.
   - Die neu hochgeladene bbox_url enthält Sarahs Box `[1256,177,1449,417]` auf **allen 200+ Frames**, keine führenden Nulls.
   - Sync.so-Webhook → `COMPLETED`, `final_url` wird geschrieben.
3. Wenn P1/P2/P3 alle drei durchlaufen und im Preview die richtigen Münder synchen → done.
4. Wenn nach dem Fix erneut REJECTED → dann ist es doch die Sarah-Face-Position selbst (Klasse A: Rekognition-Off). Aber der aktuelle Beweis zeigt: die Box sitzt rechts, wo Sarah steht. Sehr unwahrscheinlich.

## Was NICHT angefasst wird

- `asd-strategy.ts` (schon v169-konform)
- `plate-face-identity.ts` (v183 Bridge)
- `plate-face-detect.ts` (AWS Rekognition)
- Preclip-Erzeugung, Face-Gate, Watchdog, Refund-Pfad, Sync.so-Webhook
- N=1 Pfad (v181/v182), N=2 anti-clone (v168), Kling-Anti-Clone (v182)
- Kein Auto-Detect. Nirgends. Punkt.

## Betroffene Datei

- `supabase/functions/compose-dialog-segments/index.ts` — genau eine Funktion (`buildPerFrameBoxes`), 3 Zeilen hinzu.

## Empfehlung nach Approval

Ich baue Option 1, deploye `compose-dialog-segments`, und du drückst auf einer der drei fehlgeschlagenen Szenen (`3d5298b3…`, `d838e0fd…`, oder eine dritte) auf **Neu rendern**. Danach schaue ich in `syncso_dispatch_log` ob P3 jetzt `DISPATCHED → COMPLETED` durchläuft.
