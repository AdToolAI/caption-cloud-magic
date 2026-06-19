---
name: v131 Auto-Detect Primary on Verified Single-Face Preclip
description: Sync.so sync-3 dispatch uses auto_detect:true as primary on v69 single-face preclips; coords/frame only as explicit retry fallback
type: feature
---

# v131 — `auto_detect` als Primary auf Preclip-Pass

## Ursache (Root-Cause Lab 2026-06-19)

Sync.so `sync-3` produziert `generation_unknown_error` reproduzierbar, sobald `(coordinates, frame_number)` im Payload steht, selbst wenn der Coord auf einem sichtbaren Gesicht liegt. Lab-Matrix für Failures `33427056…` und `ec23f623…`:

| Variante | Ergebnis |
| --- | --- |
| `exact` (coords + frame_number) | FAILED |
| `omit_sync_mode` | FAILED (selbe Coords) |
| `auto_detect` | **COMPLETED** |
| `bboxes` (per-frame URL) | **COMPLETED** |
| `lipsync_2_pro` | FAILED (nicht prod-relevant) |

Asset, Audio, Crop und Codec sind nachweislich fehlerfrei — Sync.so kommt klar, sobald es das Gesicht selbst suchen darf.

## Fix

**Rule 0** in `supabase/functions/_shared/asd-strategy.ts` (höchste Priorität vor Rule 1 Preflight-Coord):

```
usePreclip
  && !isCoordsProRetry(retryVariant)
  && !isBboxRetry(retryVariant)
  && preclipFaceCount === 1
  && preclipAmbiguityRisk === "clean"
  → { auto_detect: true }
```

Voraussetzung: v69-Unified-Single-Face-Preclip garantiert genau 1 Gesicht im Crop (`mem://architecture/lipsync/v69-unified-single-face-preclip.md`). Damit ist die Coord-Disambiguierung strukturell überflüssig.

Diagnostic im `syncso_dispatch_log.meta.asd_strategy`:
- `rule: "rule_0_preclip_single_face_verified"`
- `preclip_single_face_verified: true`
- `had_preflight_coord: <bool>` (falls Preflight einen Coord hatte, den wir bewusst ignoriert haben)

## Fallback-Ladder (klein)

Wenn `auto_detect` auf einem Pass `generation_unknown_error` liefert:

1. **Pass 2:** `bounding_boxes_url` aus face-probe Frames (`bbox-url-pro` retryVariant → Rule 2).
2. **Pass 3:** Voller Plate ohne Preclip (bestehender v69-Fallback).

Coords + `frame_number` werden **nicht** mehr als Auto-Fallback genutzt. Sie bleiben nur über explizite Retry-Variants `coords-pro` / `preflight-snap` erreichbar (Admin-Triggered).

## Was unverändert bleibt

- `sync_mode: 'cut_off'` — Lab hat bewiesen, dass es nicht der Trigger ist.
- Multi-Speaker mit `neighbor_inside_crop` → Rule 3 doc-strict coords (Rule 0 fängt nur clean+single).
- v69 Single-Face-Preclip-Rendering — Voraussetzung für Rule 0.
- `lipsync_2_pro` bleibt aus der Pipeline; im Replay-Lab nur als Provider-Vergleich (UI-Tooltip "Diagnostik, nicht prod-relevant").

## Verifikation

Replay-Lab nach Deploy erneut für `33427056…` / `ec23f623…` ausführen — der `exact` (= echter Prod-Pfad) muss jetzt COMPLETED liefern, weil er Rule 0 trifft. 24h Canary: `provider_unknown_error` auf Preclip-Passes erwartet < 1 %.
