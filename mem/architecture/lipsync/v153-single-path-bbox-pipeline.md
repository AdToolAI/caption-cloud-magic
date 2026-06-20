---
name: v153.6 Single-Path bbox-url-pro Pipeline (Preclip Removed)
description: Einheitliche Dialog-Lipsync-Pipeline für 1–4 Sprecher; Preclip-/auto_detect-Pfad samt Batch-Render, Per-Pass-Render, v107/v126-Hard-Fail und `if (usePassPreclip)` Branch sind aus compose-dialog-segments entfernt.
type: feature
---

# v153.6 — Single-Path bbox-url-pro Pipeline (Preclip Path Deleted)

## Harte Regel

Jeder Dialog-Lip-Sync-Pass für N=1..4 nutzt ausschließlich:

```ts
active_speaker_detection = {
  auto_detect: false,
  bounding_boxes_url: <signed-url>,
}
```

`auto_detect:true`, Preclip-Dispatch, synthetische Coords-Boxen und stille Downgrades sind für den Dialog-Pfad verboten und werden vom v140 Safety-Net direkt am Wire geblockt.

## Pfade entfernt (v153.4 → v153.6)

- **v153.4** — Legacy-Batch-Preclip (`plan_b_B_batch_preclip_*`, `composer.batch_preclip_render` DB-Flag) gelöscht.
- **v153.5** — Per-Pass-Preclip-Render (`renderPassFacePreclip`, v69/v77/v94/v114/v116) gelöscht; `_shared/pass-face-preclip.ts` Import entfernt. v107/v126 Hard-Fail durch v153-natives `v153_plate_bbox_required` ersetzt (identische Wallet-Refund-Logik, neuer error_class).
- **v153.6** — Großer `if (usePassPreclip) { … }` Branch (~280 Zeilen: v129.1 payload-contract, v130 ASD-Strategy, `v1291_preclip_sync3` Logs, `preclip-sync3-autodetect-v105` stage) gelöscht. `occlusion_detection_enabled = true` ist jetzt global. `usePassPreclip` und `passPreclipUrl` bleiben als `false`-Konstanten stehen, damit verbleibende ternäre Reads compilen.

## Hydration & Persistence

1. `dialog_shots.plate_identity` persistiert `dims`, `bboxes`, `faces`, `resolvedCount`, `sourceClipUrl`.
2. Jeder Advance/Retry hydratisiert `speakerPlateBboxes` zuerst aus diesem Snapshot.
3. Wenn kein Snapshot existiert, läuft `resolvePlateFaceIdentities` auch für Advance/Retry live nach.
4. Pre-Flight gilt für alle Passes: keine `plateDims` oder keine eigene Box pro Sprecher → `v153_plate_bbox_required` Fail + Refund.
5. Direkt vor Provider-Fetch blockt ein finaler v140-Assert jedes kanonische `auto_detect:true` und loggt zusätzlich `v153.3_preclip_overwrite_detected`, falls noch eine Stelle die ASD nach v153 überschreibt.

## Acceptance

Logs müssen pro Pass zeigen:

- `BOOT version=v153.6`
- `v153.2_plate_hydration source=persisted|live boxes=N/N`
- `v153.2_unified_bbox_primary ... bbox-url-pro SINGLE PATH`
- `v153.3_batch_preclip_skipped reason=v153_bbox_primary` (1x pro Szene)
- `WIRE_PAYLOAD version=v153.6 ... "auto_detect":false,"bounding_boxes_url":"..."`

Es darf weder ein `plan_b_B_batch_preclip_*` noch ein `v1291_preclip_sync3` noch ein `v107_preclip_required` Log mehr auftauchen — wenn doch, ist ein Deploy fehlgeschlagen.

## Deprecated Memory

Folgende Memory-Files beschreiben den entfernten Preclip-Pfad und sind nur noch historisch:

- v99-preclip-explicit-bbox.md
- v123-stale-preclip-invalidation.md
- v12919-preflight-validates-provider-input.md
- v12920-plate-face-detection-every-speaker.md
- v1291-payload-contract-doc-strict.md
