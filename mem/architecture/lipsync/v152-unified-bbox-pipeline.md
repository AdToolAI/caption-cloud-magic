---
name: v152 Unified bbox-url-pro Pipeline
description: Einheitlicher Sync.so-Pfad für alle Dialog-Pässe (N=1..4). Preclip-Render entfällt im Standardpfad, bbox-Hard-Fail statt Silent-Downgrade.
type: feature
---

# v152 — Unified bbox-url-pro Pipeline

## Was geändert wurde

Vor v152 hatte die Dialog-Shot-Pipeline zwei sich gegenseitig ausschließende Pfade:

- **N=1 + N=2 (Standard)**: 512×512 Single-Face-Preclip via v116 EXPANSION_LADDER (1.0/1.4/1.8) + Face-Gate (first/mid/last frame ≥1 face), dann Sync.so mit dem gecroppten Video.
- **N≥2 (v147 PRIMARY)**: Full-Plate + `bounding_boxes_url` direkt an Sync.so sync-3.

Das Problem: Multi-Speaker-Pässe rannten beide Pfade gleichzeitig. v147 sagte „bbox-url-pro PRIMARY", aber v116-Preclip-Render lief trotzdem, schlug am Face-Gate fehl (`face_gate_failed:count=0`), und der v126-Hard-Fail-Guard blockierte den Dispatch — obwohl bbox-url-pro mathematisch funktioniert hätte.

**Ab v152**: Alle Pässe (N=1..4) mit Coords + plate dims + (für N≥2: aufgelöste Plate-Identity) gehen über genau **denselben** bbox-url-pro Pfad. Preclip-Render wird vor dem Lambda-Call übersprungen.

## Trigger-Bedingung

```ts
const v152UnifiedBboxEligible =
  !isRetry &&
  body?.noop_auto_escalation !== true &&
  speakers.length >= 1 &&
  !!plateDims &&
  Array.isArray(pass.coords) &&
  Number.isFinite(Number(pass.coords?.[0])) &&
  Number.isFinite(Number(pass.coords?.[1])) &&
  (speakers.length === 1 ||
    (!!plateIdentityMap && plateIdentityMap.resolvedCount > 0));
```

Setzt `(pass as any)._v152BboxPrimary = true`, nullt cached preclip-Felder, und überspringt drei Code-Stages:

1. **v116 EXPANSION_LADDER-Loop** (compose-dialog-segments/index.ts:3566) — `wantPassPreclip && !preclip_url && !_v152BboxPrimary`
2. **v126 Hard-Fail-Guard** (~Zeile 3898) — `v126PreclipExpected && !usePassPreclip && !_v152BboxPrimary`
3. **Implizit**: bbox-Construction (Zeile 4325+) läuft wie für N≥2 üblich, mit synthetischem Fallback aus `pass.coords` + plate dims wenn faceMap keinen Treffer hat.

## Hard-Fail-Policy (statt Silent-Downgrade)

Wenn bbox-Upload fehlschlägt, `nonNullFrames < 1` ist, oder die bbox-Geometrie außerhalb 0.2%–45% der Plate-Fläche liegt, **bricht der Pfad sofort hart ab** mit:

- Wallet-Refund (idempotent über `prevState.refunded` Flag)
- Scene-Update mit `lip_sync_status: "failed"` + klarer `clip_error`-Message
- `logSyncDispatch` mit `sync_status: "PRE_DISPATCH_FAILED"` + `error_class: "v152_bbox_hard_fail"`
- HTTP 422 Response

Implementation: `(pass as any)._v152HardFail = { reason, errorClass, message, meta }` wird in der bbox-Construction gesetzt; direkt nach der `failBeforeProviderDispatch`-Deklaration (~Zeile 4591) wird der Hard-Fail aufgelöst.

**Begründung User-Direktive 2026-06-20**: „Lieber sofort hart failen als 30 min später mit Pseudo-Lipsync zu enden. bbox so robust machen dass es kaum fehlschlägt."

## Bbox-Robustheits-Kette

Reihenfolge der bbox-Quellen in `compose-dialog-segments/index.ts:4332+`:

1. **faceMap matched face** (Gemini Vision, by characterId → slotIndex) — `bboxSource = "facemap:<source>"`
2. **Synthetic from pass.coords** (Fallback, Zeile 4362+) — `bboxSource = "synthetic"`, baut Box als 18%×28% der Plate um `pass.coords`

Sanity-Gate: `boxArea / plateArea` muss in `[0.002, 0.45]` liegen, sonst Hard-Fail.

## Was NICHT entfernt wurde

- **v116 EXPANSION_LADDER-Code + Face-Gate** bleiben als Legacy-Fallback für:
  - `noop_auto_escalation: true` Retries (NOOP-Ladder Step 1+)
  - Non-bbox Retry-Variants: `coords-pro`, `sync3-coords`, `coords-pro-lp2pro`
  - Edge-Cases ohne Plate-Identity / ohne plate dims
- **v151 Identity-Swap-Hardening, v150 NOOP-Bytes-Heuristik, v149 Master-Watchdog, v148 NOOP-Bypass** unverändert
- **RETRY_VARIANTS** Reihenfolge unverändert

## Telemetrie für v153 Cleanup

7 Tage tracken: `count(v152_unified_bbox_primary)`, `count(v152_BBOX_HARD_FAIL)` mit Breakdown nach reason. Wenn Hard-Fail-Rate < 1% → v153 entfernt EXPANSION_LADDER-Loop + Face-Gate-Code komplett (~200 Zeilen).

## Recovery

Nach Deploy: User klickt „Sauber neu starten" → Fresh-Dispatch → `v152UnifiedBboxEligible=true` → kein Preclip-Render mehr → bbox-url-pro PRIMARY direkt für alle 4 Sprecher der Multi-Speaker-Szene.
