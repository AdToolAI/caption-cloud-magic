# v152 — Unified bbox-url-pro Pipeline (N=1..4)

Status: implemented + deployed

## Was umgesetzt wurde

1. **`v152UnifiedBboxEligible`** ersetzt `v150FreshBboxEligible` in `compose-dialog-segments/index.ts` (~Z. 2787):
   - Greift jetzt ab `speakers.length >= 1` (vorher >=2).
   - N=1 braucht keine Plate-Identity (1 Gesicht, 1 Sprecher, synthetic bbox aus pass.coords).
   - Setzt `(pass as any)._v152BboxPrimary = true` und nullt alle preclip-Felder.

2. **v116 EXPANSION_LADDER-Loop gegated** (~Z. 3566): `wantPassPreclip && !preclip_url && !_v152BboxPrimary`. Spart 1-3 Lambda-Renders pro Pass.

3. **v126 Hard-Fail-Guard entschärft** (~Z. 3898): `!_v152BboxPrimary` als zusätzliche Bedingung.

4. **bbox-Geometrie Sanity-Gate** (~Z. 4403): `boxArea/plateArea` muss in [0.002, 0.45] liegen, sonst Hard-Fail.

5. **Hard-Fail-Pfad** für `_v152BboxPrimary` Pässe statt Silent-Downgrade (~Z. 4445):
   - Setzt `(pass as any)._v152HardFail = { reason, errorClass, message, meta }`.
   - Wird direkt nach der `failBeforeProviderDispatch`-Deklaration (~Z. 4591) aufgelöst → Wallet-Refund + Scene-Update + HTTP 422.
   - Reason-Codes: `bbox_url_upload_failed`, `bbox_zero_voiced_frames`, `bbox_geometry_insane:area_pct=<n>`.

6. **Legacy-Pfad** (non-v152) behält den bestehenden Silent-Downgrade auf `coords-pro` für Backward-Compatibility mit Retry-Pfaden.

## Recovery für aktuelle Szene

User klickt „Sauber neu starten" → Fresh-Dispatch trifft `v152UnifiedBboxEligible=true` für alle 4 Sprecher → kein Preclip-Render → bbox-url-pro PRIMARY für alle Pässe.

## Telemetrie

Beobachten über die nächsten 7 Tage:
- `v152_unified_bbox_primary` (sollte = Anzahl Multi-Speaker Fresh-Dispatches)
- `v152_BBOX_HARD_FAIL` mit Reason-Breakdown (Ziel: < 1% aller v152-Dispatches)
- `bbox_area_pct` Distribution (Ziel: Median 5-15%, P99 < 40%)

Wenn Hard-Fail-Rate stabil unter 1% → v153 entfernt EXPANSION_LADDER-Code + v116 Face-Gate-Helper komplett (~200 Zeilen Cleanup).
