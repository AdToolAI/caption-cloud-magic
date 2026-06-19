---
name: ASD Strategy Single-Source Builder (v130)
description: compose-dialog-segments uses a pure buildAsdStrategy() function (_shared/asd-strategy.ts) as the single source of truth for Sync.so active_speaker_detection — replaces the v115→v129.30 if/else cascade and the post-payload snap mutation
type: architecture
---

# v130 — Single-Source ASD Builder

## Problem (pre-v130)

`compose-dialog-segments/index.ts` baute `active_speaker_detection` in **drei** unkoordinierten Schritten:

1. **Block A** (~230 Z. if/else, v115→v129.30) — initial ASD pro Pass
2. **Block B** — Multi-Speaker bbox-url Override
3. **Block C — Face-Gate Snap-Mutation (v129.30)** — patched `syncOptions` + `payload.options` *nachträglich*

Folge: Zwei Quellen der Wahrheit → v124-Sanitizer konnte Snap-Coords strippen wenn `auto_detect: true` noch drin stand → "Snap-Kandidat erkannt, noch nicht im Dispatch angewandt".

## v130 Lösung

Eine pure, deterministische Funktion `buildAsdStrategy()` in `supabase/functions/_shared/asd-strategy.ts` produziert ASD aus expliziten Inputs:

```ts
buildAsdStrategy({ preflight, geometry, retryVariant, isMultiSpeaker, usePreclip })
  → { mode, asd, frameNumber, coordSpace, source, diagnostics }
```

**5 Regeln (Priorität von oben)**:

1. `preflight_coord` — Gemini Vision lieferte Face-Coord (snap oder direkt). Doc-strict ASD.
2. `bbox_url` — Multi-Speaker mit pre-uploadeter `bounding_boxes_url` (oder inline fallback).
3. `preclip_coord_strict` — Multi-Speaker mit sibling-im-crop ODER coords-pro Retry → transformierte preclip-Coord.
4. `single_face_auto` — Clean 1-Face preclip / Single-Speaker → `{ auto_detect: true }`.
5. `last_resort_auto` — Unbekannt / fehlende Inputs → `auto_detect:true` mit `last_resort: true` Diagnostic.

## Was sich geändert hat

- **`_shared/asd-strategy.ts`** (NEU) — Pure Builder + Typen.
- **`_shared/asd-strategy.test.ts`** (NEU) — 12 Deno-Tests, alle grün. Exhaustive Check dass `auto_detect:true` NIE mit Coords im selben Payload landet.
- **`compose-dialog-segments/index.ts` Block A** (Z. ~3465–3580) — 230 Zeilen if/else durch ~110 Zeilen Strategy-Aufruf ersetzt.
- **`compose-dialog-segments/index.ts` Block C** (Snap-Mutation) — statt ad-hoc patch wird `buildAsdStrategy` mit `preflight: {faceFound:true, coord:snapped}` re-invoked. Garantiert identische Shape zu first-attempt mit Preflight-Hit.

## Retry-Variant `preflight-snap`

Neu in v130: Wenn ein Pass mit persistiertem `dispatch_coords_snapped` re-dispatched wird, setzt der Caller `retry_variant = "preflight-snap"`. Block A's Strategy-Aufruf erkennt das und baut `preflight: { faceFound: true, coord: persisted }` → Rule 1.

## Was NICHT geändert wurde

- v124 sync-3 Sanitizer (Z. 156) — bleibt als Defense-in-Depth.
- Block B (Multi-Speaker bbox-url Upload, Z. 3740–3856 vor Refactor) — bleibt eigenständig.
- bbox-url / expanded-crop Eskalationsladder im Webhook.
- Audio-Preflight, Face-Gate JPEG-Cache, Refund-Logik.

## Test-Strategie

```
deno test supabase/functions/_shared/asd-strategy.test.ts
→ 12 passed
```

E2E Verifikation: re-dispatch eines fehlgeschlagenen Passes; im `syncso_dispatch_log.meta.asd_strategy.mode` muss `preflight_coord` (mit Snap) oder `single_face_auto` (clean) stehen — kein `last_resort_auto` und kein "snap_applied_to_dispatch ohne mode wechsel".

## Refs

- Code: `supabase/functions/_shared/asd-strategy.ts`
- Tests: `supabase/functions/_shared/asd-strategy.test.ts`
- Integration: `supabase/functions/compose-dialog-segments/index.ts` Z. 95–99 (import), 3465–3580 (Block A), 4379–4495 (Block C re-strategy).
