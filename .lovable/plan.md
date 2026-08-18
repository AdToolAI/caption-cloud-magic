# FA-4 v404 — P1 Remediation (Code + Tests only, kein Deploy, kein Render)

Alle drei P1 sind read-only bestätigt. Dieser Plan setzt exakt den freigegebenen Remediation-Scope um.

## P1-A — NOOP-Retry Preclip Preservation

`supabase/functions/compose-dialog-segments/index.ts` (Coords-Refresh-Block ~Z. 4574–4592)

- `inActiveNoopRetry === true` wird strukturell wie der Terminal-Guard behandelt: kein Überschreiben von `p.coords`, keine Invalidierung von `preclip_url` / `preclip_crop` / `preclip_render_id` / `preclip_bbox_drift_rejected` / `preclip_error` / `preclip_face_count`, kein Re-Render, keine Geometry-Neuberechnung.
- Abweichende `freshCoord` werden nur als Diagnose geparkt: `candidate_coords`, `candidate_coords_at`, `candidate_coords_source` + `COORD_REFRESH_SKIPPED`-Log mit eigener Reason (`noop_retry_preserved`), danach `continue`.
- Die Entscheidung wird vor jeder Invalidierung getroffen. `_shared/noop-retry-preclip.ts` bekommt dafür ein PURE-Prädikat, das der Produktionspfad tatsächlich als Branch-Bedingung nutzt (nicht nur Logging).
- `v161PreclipEligible` bleibt unverändert false bei NOOP-Eskalation; `v204_preclip_required` feuert dadurch nicht mehr.

## P1-B — report-lipsync-motion-probe = reine Telemetrie

`supabase/functions/report-lipsync-motion-probe/index.ts`

- `update_dialog_pass_slot(...)` vollständig entfernen (keine Writes auf `yavg_probed_at`, `yavg_value`, `motion_verdict`, `motion_noop`, Retry- oder Scene-State).
- Fail-closed Reihenfolge: `scene_id` + `job_id` + `pass_idx` validieren → Pass laden → `slot.job_id === body.job_id` prüfen → **erst danach** ein einziger Telemetrie-Write in `syncso_dispatch_log`, gefiltert auf den exakten Schlüssel (`scene_id` + `job_id` + persistierte Pass-Identität; falls `pass_idx` nur in `meta` liegt, exakter `meta->>pass_idx`-Filter). Fehlende `job_id`, fehlender Pass oder Mismatch ⇒ No-op, null Writes.
- Kein Bulk-Update; wenn der vollständige Schlüssel mehrere Zeilen treffen könnte, fail-closed kein Write.
- Client-De-Dupe bleibt session-lokal (`probedThisSession` in `useMouthYavgProbe`), kein neuer State-Write.

## P1-C — echte globale 27.000-ms-Wall-Clock-Deadline

`supabase/functions/_shared/measure-provider-motion-sync.ts`

- `startedAt` (monotonic) + `absoluteDeadline = startedAt + MEASUREMENT_DEADLINE_MS`, ein gemeinsamer Root-`AbortController` mit Timer, der den kompletten Lauf abbricht.
- Vor jeder Operation `remainingMs` berechnen; `<= 0` ⇒ `measurement_deadline_exceeded`. Jeder Fetch, jeder Still-Download und `timeoutInMilliseconds` im Lambda-Payload werden auf `remainingMs` gedeckelt (kein festes 120000, kein erneutes volles 27000).
- Dimension-Probe ebenfalls budgetiert.
- Ergebnis bei Überschreitung ausschließlich: `measurement_status = "unmeasurable"`, `reason = "motion_probe_indeterminate:measurement_deadline_exceeded"` ⇒ upstream `ssw:failed`, kein Retry, kein Mux.

## Tests

- Deadline (injizierte Clock + renderStill-Stub): A alles <27 s ⇒ measured; B Preclip verbraucht Budget ⇒ unmeasurable; C Provider hängt ⇒ globaler Abort; D kein Request bekommt erneut volles Budget; E Gesamtlauf nie ≥ 2×27000. Keine echten Lambda-Invokes.
- P1-A Field-Parity: `preclip_url` / `preclip_crop` / `preclip_render_id` / `coords` unverändert, Candidate-Felder gesetzt, `v161PreclipEligible=false`, kein v204-Fail.
- Fresh-vs-Retry-Wire-Parität: identisch in Modell, Video/Preclip-URL, Audio, Contract-E-Box, Frame-Count, voiced windows, sync_mode, Speaker-Identität, `segment_id`, run/gen; einziger Unterschied `bounding_boxes_url` vs. inline `bounding_boxes`.
- report-lipsync Tests: missing job_id ⇒ zero writes; mismatch ⇒ zero writes; exakter Match ⇒ genau ein Telemetrie-Write, null Slot-Writes.
- Matrix B–M vollständig (success/noop/indeterminate, Browser-absent, Duplicate Callback, stale run/gen, Wire-Parität, Preclip-Preservation, Single-Speaker unverändert, Measurement-Timeout, ROI 461/411/358/154, Threshold-Grenzen 15.405704881800869 / 3.682671115501879).

## Testbarkeit

Kleine PURE Helper nur für Preclip-Preservation, ASD-Wire-Vergleich, Completed-Decision-Mapping und Deadline-Budget — jeweils vom Produktionspfad tatsächlich verwendet, keine neue Authority.

## Version & Scope

- `COMPOSE_DIALOG_SEGMENTS_VERSION` → `v405-fa4-noop-retry-preservation-final`. `sync-so-webhook` nur bumpen, wenn dort tatsächlich Code geändert wird; Measure-Helper behält v404 mit eindeutigem Reason-Log.
- Diff eng: `compose-dialog-segments/index.ts`, `_shared/noop-retry-preclip.ts`, `_shared/measure-provider-motion-sync.ts`, `report-lipsync-motion-probe/index.ts`, neue Tests. Keine Migration, keine Remotion-, Geometry-, Contract-E-, Audio-, RPC-, Mux- oder RS3-Änderung.
- `deno check`: Baseline 5 bekannte Fehler, danach 0 neue.
- Kein Deploy, kein Render, kein Dispatch. Abschluss als Report A–O + Gate.
