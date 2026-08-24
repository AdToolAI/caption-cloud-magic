---
name: v500 Golden Runtime Contract
description: Autorität für Lip-Sync ist der empirische Golden Run c934a823, nicht die v400-Prosa; Outcome-Gate darf nur bewiesenen Passthrough terminalisieren.
type: architecture
---

# V500 — Golden Runtime Contract (2026-08-24)

## Autorität
Nicht „v400 laut Dokument", sondern der gemessene Known-Good-Lauf
`c934a823-47de-49b7-a62e-a116b49ca3b2`. Fixture:
`_shared/v500-golden-contract.ts`, Contract: `_shared/v500-core-contract.ts`.

## Was der funktionierende Kern wirklich war
- Anchor `face_center`, `mouth_offset = 0`, `plate_mouth = null`
- **kein** Camera Path (0 Keyframes), statischer quadratischer Crop
- reale Mundhöhe 0.571–0.612 (Nebeneffekt, kein Ziel)
- Face-Share 0.252–0.400, Face 182–288 px im Preclip
- `sync-3` · `bbox-url-pro` · `bounding_boxes_url` · `cut_off` · clip-space · preclip
- **kein** Outcome-Gate

Daraus folgt: **0.62-Mouth-Priority und Dynamic Camera Path sind KEINE
Anforderungen** und dürfen nicht erzwungen werden (`V500_NOT_REQUIRED`).

## Outcome-Gate (V500-B2)
`_shared/v500-passthrough-gate.ts` — einziger Zweck: echten Passthrough
verhindern.
```
motion                                   -> accept
noop + Mundanker BEOBACHTET (landmark)   -> proven_passthrough (terminal)
noop + Anker abgeleitet/unbekannt        -> unknown (motion_unverified)
indeterminate                            -> unknown
```
V465 `mouth_over_frame` bleibt Mess-Autorität, verliert die Terminalitäts-
Autorität ohne verifizierten Mundanker. Verdrahtet in `sync-so-webhook` und
`lipsync-watchdog`.

## Release-Leitplanke (verbindlich)
Jede Lip-Sync-Logik, die einen Golden-Pass als terminal fehlgeschlagen
klassifiziert, ist per Definition nicht releasefähig. Erzwungen durch
`_shared/v500-passthrough-gate.test.ts`.

## ASD
Kein Rückbau auf die statische Golden-ASD-Geometrie. Golden-Semantik
(`bounding_boxes_url`, sync-3) bleibt, die frame-korrekte V464-Registrierung
bleibt ebenfalls.
