# FA-4 v404 — P1 Blocker Verification (read-only Befund) + Remediation-Scope

Alle drei gemeldeten P1 sind im aktuellen Stand read-only bestätigt. Kein Code geändert, kein Deploy, kein Render.

## Befund 1 — Coords-Refresh zerstört den NOOP-Retry-Preclip (BESTÄTIGT, P1)

`supabase/functions/compose-dialog-segments/index.ts`

- Z. ~4574: `if (inActiveNoopRetry) { … COORD-REFRESH-ALLOWED … }` — der aktive NOOP-Retry wird ausdrücklich vom v128-Terminal-Guard ausgenommen.
- Z. ~4581–4587: unmittelbar danach werden `preclip_url`, `preclip_crop`, `preclip_render_id`, `preclip_bbox_drift_rejected`, `preclip_error`, `preclip_face_count` genullt und `p.coords` überschrieben.
- Z. ~4876: `shouldPreserveNoopRetryPreclip({ … hasPreclipUrl: !!(pass as any).preclip_url })` läuft erst ~290 Zeilen später und ist ein reines Logging-Prädikat ohne Wiederherstellung — bei bereits genulltem `preclip_url` liefert es `false`.
- Z. ~5462: `v161PreclipEligible` enthält `body?.noop_auto_escalation !== true` → es wird kein Ersatz-Preclip gerendert.
- Z. ~6784: `v204_preclip_required` schlägt danach fail-closed zu.

Folge: Der frozen Wire „identischer Preclip, identisches Audio, identische Contract-E-Box, einziger Unterschied `bounding_boxes_url` → inline `bounding_boxes`“ ist nicht garantiert.

## Befund 2 — report-lipsync-motion-probe ist keine reine Telemetrie (BESTÄTIGT, P1)

`supabase/functions/report-lipsync-motion-probe/index.ts`

- Z. ~178–184: `admin.rpc("update_dialog_pass_slot", { … yavg_probed_at, yavg_value })` — Scene-/Pass-Slot-Mutation, die der v404-Vertrag ausschließt.
- Z. ~139–140: Telemetrie-Update filtert `.eq("scene_id", …)` und hängt `.eq("job_id", …)` nur an, wenn `job_id` gesetzt ist → ohne `job_id` können mehrere `syncso_dispatch_log`-Zeilen derselben Szene getroffen werden, bevor der Job-Slot-Mismatch-Check (Z. ~160–172) greift.

## Befund 3 — keine harte Wall-Clock-Deadline (BESTÄTIGT, P1)

`supabase/functions/_shared/measure-provider-motion-sync.ts`

- Z. 40: `MEASUREMENT_DEADLINE_MS = 27000` existiert, wird aber pro Einzeloperation verwendet: Z. 232 und Z. 238 setzen `AbortSignal.timeout(MEASUREMENT_DEADLINE_MS)` je Request; Z. 216 erlaubt `timeoutInMilliseconds: 120000` für den Lambda-Still.
- Z. 269/303/307/346: `expired()` ist nur ein Check zwischen Tasks; `measureOne(preclip)` (Z. 337) und `measureOne(provider)` (Z. 342) laufen sequentiell.
- Worst case: Summe der Einzel-Waits deutlich > 27 s, obwohl der Contract „Gesamtdeadline überschritten ⇒ indeterminate“ verlangt.

## Befund 4 — Matrix B–M nicht nachgewiesen (BESTÄTIGT)

In `supabase/functions/_shared/*.test.ts` existiert keine Datei für `noop-retry-preclip` oder `measure-provider-motion-sync`. Vorhanden sind u. a. `motion-probe-classifier.test.ts`, `plate-face-candidates.test.ts`, `preclip-dispatch-resume.test.ts`. Für Browser-absent, Duplicate Callback, stale run/gen, Fresh-vs-Retry-Wire-Parität, NOOP-Preclip-Preservation und Measurement-Timeout gibt es keinen dedizierten Nachweis.

## Gate

FA-4 v404 PRODUCTION IMPLEMENTATION = BLOCKED — P1 retry-preclip preservation + telemetry state ownership + deadline enforcement (alle drei read-only bestätigt) → STOP

## Remediation-Scope (erst nach separatem GO, noch nicht ausführen)

1. Coords-Refresh bei `inActiveNoopRetry` fail-closed: Preclip-Felder nicht nullen, Refresh als Kandidat parken (analog COORD_REFRESH_SKIPPED) — Preservation vor jeder Invalidierung.
2. `report-lipsync-motion-probe`: `update_dialog_pass_slot`-Aufruf entfernen; Telemetrie-Update nur mit vollständigem `scene_id + job_id + pass_idx`-Schlüssel, sonst No-op.
3. `measureProviderMotionSync`: eine echte Wall-Clock-Deadline über den Gesamtlauf (ein gemeinsamer `AbortController`, Rest-Budget pro Request, Lambda-Timeout ≤ Restbudget) ⇒ `indeterminate`.
4. Dedizierte Deno-Tests für Matrix B–M inkl. NOOP-Preclip-Preservation, Wire-Parität und Deadline.
