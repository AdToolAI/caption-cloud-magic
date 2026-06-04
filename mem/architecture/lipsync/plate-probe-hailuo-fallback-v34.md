---
name: Plate-Probe Hailuo Fallback (v34)
description: probeMp4Dims gained a Phase D sample-entry FourCC scan for Hailuo MP4s with zero-width tkhd; compose-dialog-segments falls back to anchor faceMap dims for 3+ speakers when MP4 probing returns null; reset-lipsync-scene now clears audio_plan.twoshot.faceMap so retries re-detect faces.
type: architecture
---

**Trigger (Juni 2026)**: Scene `f03cdc20…` (3 Sprecher) failed mit `plate_probe_failed_3plus_speakers` BEVOR Sync.so überhaupt aufgerufen wurde. Logs: `probe-result phaseA=http_206+nomoov phaseB=http_206+nomoov phaseC=http_206+notkhd dims=null`. Der Hailuo-MP4-Muxer schreibt manchmal `tkhd` mit width=height=0 (Transform-Matrix only); die echten Maße stehen nur im AVC visual sample entry inside `stsd`. Unser v33 Hard-Preflight blockierte daher gültige 3-Sprecher-Plates.

**v34 Fixes**:

1. **`twoshot-face-map.ts` Phase D**: Sample-entry FourCC scan (`avc1`, `avc3`, `hvc1`, `hev1`, `vp09`, `av01`) im Tail-Range. Liest width/height aus dem visual sample entry header (offsets +24/+28/+32 vom FourCC). Greift wenn tkhd null liefert.

2. **`compose-dialog-segments` anchor-dims fallback**: Bei `plateDims=null` UND `speakers.length >= 3` wird die `audio_plan.twoshot.faceMap.{width,height}` als trusted fallback genutzt (256–8192 px sanity check). Quelle wird als `anchor_facemap_fallback` geloggt. Nur wenn auch das fehlt, terminal-fail mit Refund.

3. **`reset-lipsync-scene` cache clear**: „Sauber neu starten" löscht jetzt `audio_plan.twoshot.faceMap` + `anchor_face_audit`. Sonst wurde bei jedem Reset dieselbe stale Geometrie wiederverwendet.

**Unverändert**: v23 Server-Owned State, v24 Unified Multi-Pass, v25 Fan-Out, v30 coords-pro-box, v31 FaceMap-BBox, v32 Circuit-Loop-Fix, v33 Single-Flight Lock & Hard-Preflight.
