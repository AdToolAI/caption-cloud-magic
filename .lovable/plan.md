# v153.1 — Einheitliche Pipeline für 1–4 Sprecher

## Ziel
Die `bbox-url-pro` Single-Path Pipeline gilt **identisch für alle Sprecherzahlen** (N=1, 2, 3, 4). Kein Sonderpfad mehr für N=1.

## Änderungen in `supabase/functions/compose-dialog-segments/index.ts`

### 1. Plate-Native Bbox auch für N=1 verpflichtend
Aktuell (v153.0): N=1 darf auf „synthetic coords" zurückfallen.
Neu (v153.1): Auch N=1 verwendet zwingend `speakerPlateBboxes[0]` → `plateIdentityMap` → **Hard-Fail** bei Fehlen. Kein synthetischer Fallback mehr.

### 2. Pre-Flight Hard-Fail Gate vereinheitlicht
Das aktuell auf `N ≥ 2` beschränkte Pre-Flight Gate (`distinct boxes ≥ 8px`) wird auf alle N erweitert:
- N=1: Box muss existieren, Area in [0.2%, 45%], `nonNullFrames ≥ 1`.
- N≥2: zusätzlich Distinctness-Check (Center-Distance ≥ 8px) pro Sprecherpaar.
Bei Verstoß → sofortiger `failed + refund` mit klarer DE-Meldung, identisch für alle N.

### 3. Dispatch-Payload identisch für alle N
Immer:
```
model: "sync-3"
sync_mode: "cut_off"
active_speaker_detection: { auto_detect: false, bounding_boxes_url: <signed-url> }
```
Kein `auto_detect: true` mehr, auch nicht bei N=1.

### 4. Logging vereinheitlicht
Pro Pass: `v153.1_unified_bbox_primary speakers=N bboxSource=plate-native-... preclip=false variant=bbox-url-pro`.

### 5. Version Bump
`COMPOSE_DIALOG_SEGMENTS_VERSION = "v153.1"`.

### 6. Memory Update
- `mem/architecture/lipsync/v153-single-path-bbox-pipeline.md` aktualisieren: gilt für N=1..4, keine N=1-Ausnahme mehr, kein synthetic-coords-Fallback.
- `mem/index.md` Eintrag entsprechend anpassen.

## Was NICHT mehr existiert (final entfernt für alle N)
- Preclip-Render-Pfad (`wantPassPreclip`, `EXPANSION_LADDER`, Batch-Prefetch).
- `auto_detect: true` Pfad.
- Synthetic-Coords-Fallback.
- Legacy `retryVariant` Auswahl (immer `bbox-url-pro`).

## Erwartetes Verhalten nach „Sauber neu starten"
- N=1 Szenen: gleicher schneller Pfad wie N=4, Box direkt aus Plate.
- Wenn Plate-Box für irgendeinen Sprecher (auch bei N=1) fehlt/ungültig → sofortiger Hard-Fail + Refund, statt 30min stillem Rendern.
- Logs zeigen `v153.1_unified_bbox_primary` für alle Szenen ungeachtet Sprecherzahl.
