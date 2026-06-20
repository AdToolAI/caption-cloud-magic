---
name: v153.1 Single-Path bbox-url-pro Pipeline (N=1..4 einheitlich)
description: Einheitliche Single-Path Dialog-Lipsync für 1–4 Sprecher. Nur noch plate-native bbox-url-pro auf full plate. Kein Preclip, kein auto_detect, kein synthetic-coords-Fallback. Pre-Flight Hard-Fail wenn auch nur ein Sprecher keine eigene Box hat — gilt auch für N=1.
type: feature
---

# v153 — Single-Path bbox-url-pro Pipeline (Preclip is Dead)

## Was sich gegenüber v152 ändert

v152 hatte den unified-bbox-Pfad zwar eingeführt, aber:
1. Das Gate verlangte `plateIdentityMap.resolvedCount > 0` — fiel auf Multi-Speaker-Plates mit nur Slot-Fallback durch (Live-Beweis: `resolved=0 → variant=coords-pro`).
2. Der bbox-url-pro-Branch baute die Box aus dem ANCHOR `faceMap`, nicht aus den plate-nativen Boxen. Wenn Anchor-FaceMap keine `characterId`-Treffer hatte, fielen mehrere Sprecher auf dieselbe Box → "Sprecher 1 spricht für Sprecher 1+2".
3. Der alte Preclip-/Auto-Detect-Code lief in der Praxis weiter, weil das v152-Gate nicht griff.

## v153 — Hartes Regelwerk

### 1. Single Dispatch Path
Im Live-Pfad (kein NOOP-Retry) gibt es nur noch **einen** Sync.so-Branch:

```ts
active_speaker_detection = {
  auto_detect: false,
  bounding_boxes_url: <signed-url>,
}
```

Kein `frame_number`/`coordinates`-Branch und kein `auto_detect: true` werden je dispatched, solange der v153-Pfad eligible ist.

### 2. Box-Quellen-Priorität (im bbox-url-pro Branch)
1. **PRIMARY**: `speakerPlateBboxes[pass.speaker_idx]` — plate-native, kommt aus `resolvePlateFaceIdentities` (Hungarian-Match + Slot-Fallback). Garantiert distinkte Box pro Sprecher.
2. **SECONDARY**: anchor `faceMap` matched by characterId/slotIndex (für N=1 oder wenn plate-native ausnahmsweise fehlt).
3. **TERTIARY**: synthetisch aus `pass.coords` (nur N=1 erlaubt — N≥2 ist von Pre-Flight schon geblockt).

Logging: `bboxSource=plate-native|facemap:<src>|synthetic` in jedem Dispatch-Log.

### 3. Scene-Level Pre-Flight Hard-Fail (N≥2)
Vor der Pass-Schleife wird geprüft:
- Jeder Sprecher hat eine Plate-Box.
- Keine zwei Sprecher haben dieselbe Box (center-Distanz ≥ 8 px).

Bei Verstoß: Refund + `lip_sync_status: "failed"` + clip_error "die einzelnen Sprecher konnten auf dem Video nicht eindeutig unterschieden werden ... Credits wurden zurückerstattet." → User rendert die Plate neu, statt 20 min auf falsches Ergebnis zu warten.

### 4. Per-Pass v153-Gate
```ts
const v153HasPlateBox =
  speakers.length === 1 ||
  (Array.isArray(speakerPlateBboxes[pass.speaker_idx]) &&
    speakerPlateBboxes[pass.speaker_idx].length === 4);
const v153UnifiedBboxEligible =
  body?.noop_auto_escalation !== true &&
  speakers.length >= 1 &&
  !!plateDims &&
  Array.isArray(pass.coords) &&
  Number.isFinite(Number(pass.coords?.[0])) &&
  Number.isFinite(Number(pass.coords?.[1])) &&
  v153HasPlateBox;
```

Bei `true`: setzt `_v153BboxPrimary = true` + `_v152BboxPrimary = true` (legacy flag downstream).
`freshDefaultVariant` wird auf `bbox-url-pro` gezwungen, Collapse-Gate wird übersprungen.

### 5. Geometrie-Sanity-Gate
Box-Fläche muss zwischen 0.2 % und 45 % der Plate-Fläche liegen, `nonNullFrames ≥ 1`. Sonst Hard-Fail (kein silent downgrade).

## Was bleibt aus Sicherheit drin (dead code)

Der Legacy-Preclip-/Auto-Detect-Code (EXPANSION_LADDER, renderPassFacePreclip, batch-prefetch, v126-Guard, coords-pro Branch) ist **nicht physisch gelöscht**. Er ist nur gated:

- `wantPassPreclip && !_v152BboxPrimary` → läuft nicht mehr für frische Multi-Speaker-Pässe.
- `freshDefaultVariant === "bbox-url-pro"` für jeden v153-eligiblen Pass.
- Collapse-Gate wird nur noch für non-v153 Pfade (NOOP-Retries, edge-cases) durchlaufen.

**Begründung**: Das File ist 6049 Zeilen, ein Cut-Down-PR während eines aktiven User-Issues riskiert weitere Regression. Wenn 7 Tage Telemetrie zeigen dass kein einziger frischer Pass je auf den alten Pfad gefallen ist, wird in v154 physisch gelöscht.

## Telemetrie / Acceptance

Nach Deploy in den Logs:
- `BOOT version=v153.0` (deploy verification)
- `v153_unified_bbox_primary speakers=N pass=k plate_box=yes` für jeden frischen Pass
- `v153_bbox_url_pro_primary speakers=N` für jeden frischen Pass
- KEIN `payload_video_url=.../pX-preclip-...mp4` mehr für frische Multi-Speaker-Pässe
- KEIN `active_speaker_detection: { auto_detect: true }` mehr im WIRE_PAYLOAD

## Recovery für aktuelle Bestandsszenen

User klickt "Sauber neu starten" → fresh dispatch → v153-Pfad nimmt für jeden Sprecher die plate-native Box → Sprecher 1 spricht für 1, 2 für 2 usw.
