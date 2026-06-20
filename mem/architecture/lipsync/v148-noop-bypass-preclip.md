---
name: v148 NOOP-Eskalation überstimmt Preclip-Rule-0
description: Bei Sync.so NOOP-Eskalation droppt compose-dialog-segments den per-Pass-Preclip, damit der eskalierte bbox-url-pro / coords-pro-box Variant nicht durch Rule 0 (v131.2 auto_detect_unconditional_on_preclip) wieder auf auto_detect kollabiert.
type: feature
---

# v148 — NOOP-Bypass Preclip

## Problem
v134-NOOP-Ladder eskaliert nach `face_gate_failed:count=0` / `sync_output_reencoded_passthrough_suspect` auf `bbox-url-pro` (Stufe 0) bzw. `coords-pro-box` (Stufe 1). Wenn ein per-Pass Preclip existiert, greift jedoch Rule 0 (v131.2) und zwingt jeden Dispatch zurück auf `auto_detect` auf der single-face Crop. Resultat: 2 identische Dispatches mit demselben ASD, Ladder erschöpft → Hard-Fail.

## Fix
In `compose-dialog-segments/index.ts` direkt nach dem v120-Block:

```ts
const v148NoopBypassEligible =
  body?.noop_auto_escalation === true &&
  (requestedRetryVariant === "bbox-url-pro" || requestedRetryVariant === "coords-pro-box") &&
  !!(pass as any).preclip_url;
if (v148NoopBypassEligible) {
  (pass as any).preclip_url = null;
  (pass as any).preclip_render_id = null;
  (pass as any).preclip_crop = null;
  // Log: v148_noop_bypass_preclip step=… variant=… speaker=…
}
```

Dadurch wird `hasPassPreclipForDispatch=false` und der bestehende v147-Pfad routet auf Full-Plate `bbox-url-pro` mit Pre-Dispatch-Validation (nonNullFrames ≥ 1). Bei invalid bbox-URL: Downgrade auf `coords-pro` (existierender v147-Pfad).

## Telemetrie
- `v148_noop_bypass_preclip step=<n> variant=<v> speaker=<name>` (warn)
- `[v82-gate] … noop_esc=true → variant=bbox-url-pro (v148-noop-bypass-bbox-url-pro)`
- `v147_BBOX_URL_PRIMARY` muss bei der eskalierten Re-Dispatch feuern.

## Was unverändert bleibt
- Fresh-Dispatch (Pass 1): Rule 0 (auto_detect auf Preclip) bleibt aktiv.
- Single-Speaker: keine Ladder.
- Wire-Payload-Schema (sync-3 doc-strict).
- v147 Multi-Speaker Fresh-Dispatch ohne Preclip → bbox-url-pro primary.
