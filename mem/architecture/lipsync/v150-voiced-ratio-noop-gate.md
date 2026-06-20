---
name: v150 NOOP-Detector De-Risk + Fresh bbox-url-pro
description: v128 bytes-ratio passthrough heuristic produced false positives that hard-failed correctly lipsynced passes; v150 disables it and forces bbox-url-pro on fresh multi-speaker dispatch
type: feature
---

## Problem

v128 `reencodedPassthroughSuspect` flagged any Sync.so output where
`0.65 ≤ outputBytes/inputBytes ≤ 1.35` as NOOP. For passes with little
mouth-movement (short voiced window, mostly silent plate) this band is
the **expected** output: Sync.so only animates the voiced frames, the
rest passes through, and bytes are 70–90% of input — every single time.

Real-world impact (Szene 827ed500, 2026-06-20):
- Matthew Dusatko (4-speaker dialog, voiced 0.88s in 9s plate)
- Output sizeRatio = 0.82 → flagged NOOP
- v134-Ladder eskalierte step 0 → bbox-url-pro (0.84, also flagged)
- step 1 → coords-pro-box (0.84, also flagged)
- step 2 → HARD FAIL, scene zerstört, obwohl alle 3 Outputs lipsynced waren

Sibling speakers (Samuel, Kailee — gleiche Plate, mehr voiced-Zeit) liefen
fehlerfrei durch.

## Fix

**A) `reencodedPassthroughSuspect` deaktiviert.** Bleibt als reines Forensik-
Log (`v150_bytes_heuristic_suppressed`). `noopSuspect` triggert nur noch auf:
- `syncOutputUnchanged` (etag/bytes EXAKT identisch — deterministisch)
- `syncOutputResolutionRegression` (min-axis <720 bei ≥720 erwartet)

**B) Fresh-Dispatch Preclip-Bypass für bbox-url-pro** (compose-dialog-segments).
Bei Multi-Speaker (N≥2) + plateDims + resolved plateIdentityMap + Preclip
vorhanden → Preclip wird gedroppt, bbox-url-pro greift als PRIMARY. Macht
v147 endlich konsistent auf Fresh-Dispatch (vorher nur auf v148-Retry aktiv).
Log: `v150_fresh_bypass_preclip_for_bbox_url_pro`.

**C) v134 NOOP-Ladder gekürzt** (sync-so-webhook).
Step 0 (bbox-url-pro) entfernt — ist jetzt Fresh-PRIMARY, Retry mit gleicher
Variante sinnlos. Neuer Ladder: `coords-pro-box` (1 step), dann Hard-Fail.

## Files

- `supabase/functions/sync-so-webhook/index.ts` (lines ~593–665)
- `supabase/functions/compose-dialog-segments/index.ts` (lines ~2786–2820)

## Recovery for hard-failed scenes pre-v150

Scenes hard-failed by v128 false-positives need manual retry from UI
("Sauber neu starten" oder per-pass Retry). v150-Code-Pfad greift dann
korrekt.

## Was bewusst NICHT geändert wurde

- v147 bbox-url-pro (bleibt PRIMARY für Multi-Speaker)
- v148 NOOP-Bypass-Preclip (bleibt für echte NOOPs)
- Credit-Refund bei Hard-Fail
- Hartes NOOP-Signal `syncOutputUnchanged` (etag/bytes-identisch)
