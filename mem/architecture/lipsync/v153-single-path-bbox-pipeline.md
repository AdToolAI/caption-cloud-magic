---
name: v153.2 Single-Path bbox-url-pro Pipeline with Plate Hydration
description: Einheitliche Dialog-Lipsync-Pipeline für 1–4 Sprecher: Advance/Retry hydratisieren plate-native Boxen aus dialog_shots, alle Passes nutzen bbox-url-pro, auto_detect ist hart geblockt.
type: feature
---

# v153.2 — Single-Path bbox-url-pro Pipeline (Preclip/Auto-Detect Dead)

## Harte Regel

Jeder Dialog-Lip-Sync-Pass für N=1..4 nutzt ausschließlich:

```ts
active_speaker_detection = {
  auto_detect: false,
  bounding_boxes_url: <signed-url>,
}
```

`auto_detect:true`, Preclip-Dispatch, synthetische Coords-Boxen und stille Downgrades sind für den Dialog-Pfad verboten.

## v153.2 Fix

Der v153.1-Code konnte bei `advance=true` / `retry=true` auf den Legacy-Branch fallen, weil `speakerPlateBboxes` nur im Fresh-Dispatch befüllt wurden. Dadurch sahen echte Logs weiterhin so aus:

```txt
WIRE_PAYLOAD version=v153.1 options={"sync_mode":"cut_off","active_speaker_detection":{"auto_detect":true}}
```

v153.2 behebt das strukturell:

1. `dialog_shots.plate_identity` persistiert `dims`, `bboxes`, `faces`, `resolvedCount`, `sourceClipUrl`.
2. Jeder Advance/Retry hydratisiert `speakerPlateBboxes` zuerst aus diesem Snapshot.
3. Wenn kein Snapshot existiert, läuft `resolvePlateFaceIdentities` auch für Advance/Retry live nach.
4. Pre-Flight gilt für alle Passes: keine `plateDims` oder keine eigene Box pro Sprecher → sofort Fail + Refund.
5. Der alte `else { auto_detect:true }`-Branch ist durch `v153_unexpected_legacy_branch` Hard-Fail ersetzt.
6. Direkt vor Provider-Fetch blockt ein finaler v153.2-Assert jedes kanonische `auto_detect:true`.

## Acceptance

Logs müssen pro Pass zeigen:

- `BOOT version=v153.2`
- `v153.2_plate_hydration source=persisted|live boxes=N/N`
- `v153.1_unified_bbox_primary ... bbox-url-pro SINGLE PATH`
- `WIRE_PAYLOAD version=v153.2 ... "auto_detect":false,"bounding_boxes_url":"..."`

Es darf kein WIRE_PAYLOAD mit `"auto_detect":true` mehr geben. Falls eine Box fehlt oder kollidiert, bricht der Run sofort mit Refund ab, statt 20–30 Minuten weiterzulaufen.