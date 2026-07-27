## Vergleich: v169 vs. heute — was ist tatsächlich anders?

Die **Sync.so-Pipeline selbst** (Fan-out, Per-Pass-Lock, Preclip-Prefanout, Webhook, Watchdog, Retry-Ladder, Payload-Regeln) ist zu ~95 % noch v169. Konstanten in `compose-dialog-segments`:

```
PARALLEL_CAP=4, PER_PASS_LOCK=true, FEATURE_PLAN_D_FANOUT=true,
MAX_SHOT_RETRIES=4, RETRY_TEMPERATURES=[0.5,0.35,0.7,0.4],
LIPSYNC_MODEL=lipsync-2-pro, sync_mode=cut_off, verify_jwt=false + shared secret
```

Alles davon ist im aktuellen Deploy identisch. **Der Sync.so-Weg ist nicht kaputt.**

### Was seit v169 dazugekommen ist (und heute wehtut)

| Schicht | v169 | Heute |
|---|---|---|
| Face-Detection | Gemini Flash + v154 Sanity-Gate; MediaPipe primär | **+ AWS Rekognition (v274)** biometrisch, **+ Router (v278)** Hungarian, **+ Synthetic-Mouth (v280)** |
| Anchor | 1 Anker als Portrait-Referenz für Hailuo | **+ Seedream/Gemini-3-Pro (v270/v271)**, **+ CastActions-Prompt** („telefoniert", „druckt") → Kamera zieht raus |
| Face-Größe im Plate | Speaker war Talking-Head, ~20-40 % Frame-Breite | Speaker mit Tasks → **5–11 % Frame-Breite**, oft im Gegenlicht |
| Size-Floor im Detector | – (kein Untergrenzen-Gate, hat aber gereicht weil Köpfe groß waren) | – (fehlt immer noch — Detector halluziniert jetzt auf Backstein/Fenster) |
| Dispatch-Bedingung | resolvedCount≥1 oder plate-boxes vorhanden | Gleich, **aber die "vorhandenen boxes" sind heute oft Fake-Boxen auf Wandtextur** |

**Der eine echte Regress:** v169-Talking-Heads füllten den Frame → Rekognition/Gemini fanden zuverlässig Gesichter. Seit CastActions + weiter Anchor sind Köpfe klein → Detector liefert 4 hochkonfidente False-Positives auf Backstein → Router mappt brav → Sync.so lipsynced Wandputz. Beweisbild: heutiger Plate `0f8818ee` — alle 4 gespeicherten Coords liegen auf Mauerwerk, nicht auf Gesichtern.

Was v281 (Größen-Gate + Zero-Resolved-Refuse) allein nicht heilt: Refund-Schleife bei jedem Weitwinkel-Rendering.

## Plan v282 — „Zurück nach v169-Framing, ohne CastActions zu verlieren"

Vier präzise Rückbau-/Härtungs-Schritte. Keiner davon berührt Sync.so-Payload, Fan-out, Lock, Webhook oder Retry-Ladder — die bleiben unverändert v169.

### Schritt 1 — Anchor-Framing-Invariant zurück (v262 reaktivieren, härter)

`supabase/functions/compose-scene-anchor/index.ts`: harter Prompt-Prefix für N≥2 Sprecher:

> "MANDATORY FRAMING: every named speaker's face MUST occupy at least **15 % of the frame width** and be positioned above y=0.75. Camera is medium/medium-close. Do NOT compose a wide establishing shot even if actions are described."

Und ein **Post-Anchor-Face-Width-Gate** (`_shared/anchor-min-face-size.ts` existiert bereits — heute nur informativ). Umschalten auf **hart**: wenn Median-Face-Width < 12 %, Anchor **einmal re-generieren** mit noch engerem Framing-Prompt („close-up ensemble, faces fill 20 % width each"). Erst dann Fail.

CastActions überleben: sie beschreiben Handlung, nicht Kamera. Prompt-Reihenfolge klarstellen → Framing dominiert Camera-Distanz, Actions bestimmen Requisiten/Pose.

### Schritt 2 — Detector-Size-Floor + Upscale-Retry (v281 Ursachen-Härtung)

`_shared/plate-face-detect.ts::validatePlateFacesGeometry` erweitern:
- `bbox_too_small_absolute`: jede Box `w<4 %` **oder** `h<5 %` → fail
- `cluster_all_small`: Median-`h/H < 6 %` bei ≥2 Sprechern → fail

Bei Fail-Kette:
1. Retry Gemini-Pro mit strengem Prompt (schon vorhanden)
2. **Neu: 2×-Upscale-Retry** — Plate-Frame per FFmpeg-Node auf 1496×2468 hochskalieren, Rekognition/Gemini erneut anwerfen, Coords wieder halbieren. Fängt Weitwinkel-Szenen ab, ohne den User zu refunden.
3. Erst dann `return null` + Refund.

### Schritt 3 — Zero-Resolved-Guard (v281 unverändert)

`compose-dialog-segments`: wenn `resolvedCount === 0` **und** alle Detect-Boxen unter Size-Floor → `safeMarkSceneFailed('plate_faces_hallucinated')` + idempotenter Refund. **Kein Dispatch mit Fake-Coords.** UI zeigt klaren Grund + „Neu rendern".

### Schritt 4 — Version-String + Telemetrie ehrlich machen

- `COMPOSE_DIALOG_SEGMENTS_VERSION = "v282"` (heute „v254-attempt-tdz-hardlock" — irreführend).
- Pro Szene loggen: `anchor_median_face_width_pct`, `plate_detect_min_face_pct`, `resolvedCount`, `hallucination_gate`. Nach 20 Rendern sehen wir, ob das Framing-Problem systematisch oder ein Ausreißer ist.

## Was ausdrücklich NICHT rückgebaut wird

- **Sync.so-Dispatch (v169-Kern)**: parallel fan-out, per-pass lock, preclip-prefanout, webhook, watchdog, retry-ladder — alle bleiben.
- **CastActions**: bleiben aktiv; nur Framing dominiert.
- **v274 Rekognition-Identity-Lock**: bleibt als _Bonus_-Signal, nicht mehr als kritischer Pfad. Bei Fail → v278-Router-Fallback wie bisher.
- **v278 Hungarian Router**: bleibt, aber jetzt nur mit **echten** Boxen versorgt (dank Schritt 2).
- **v280 Synthetic-Mouth-Rescue**: bleibt orthogonal (greift bei fehlenden Landmarks, nicht bei falschen Boxen).

## Erwartetes Ergebnis vs. v169

| Metrik | v169 (Talking-Head) | Heute ohne v282 | Mit v282 |
|---|---|---|---|
| Lip-Sync-Trefferquote bei Talking-Head-Szenen | ~95 % | ~90 % | ~95 % (unverändert) |
| Lip-Sync-Trefferquote bei CastAction-Weitwinkel | n/a (gab's nicht) | ~10 % (heutiges Bug-Bild) | ~85 % (Framing enger + Upscale-Retry) |
| Fehl-Dispatch auf Wandtextur | 0 | häufig | 0 (Hard-Refuse) |
| Refund-Loops | 0 | mittel | selten (Upscale rettet meist) |

Das ist der ehrliche Weg zurück zu v169-Qualität: den Sync.so-Weg lassen wie er ist, die zwei neuen Fehlerquellen (Anchor zieht zu weit raus, Detector halluziniert auf Kleinfaces) an der Wurzel schließen.