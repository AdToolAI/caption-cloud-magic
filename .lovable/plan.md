# FA-4 Pre-Deploy Review — Evidence (read-only) + Deployment Order

No code was changed, nothing deployed, rendered, dispatched or migrated.

## 1. HEAD and versions

```text
HEAD  4738bff1846009ab7cb4254a9f8e3eca49cf50f4  2026-08-19T18:50:56Z  "Fixed multi-speak measurement race"

compose-dialog-segments/index.ts:162   COMPOSE_DIALOG_SEGMENTS_VERSION = "v408-fa4-predeploy-final"
sync-so-webhook/index.ts:59            SYNC_SO_WEBHOOK_VERSION        = "v409-fa4-speaker-cardinality-final"
report-lipsync-motion-probe/index.ts   no version const; header/marker "v404 — TELEMETRY ONLY" (lines 2, 6, 16)
_shared/measure-provider-motion-sync.ts:37  MOTION_REMOTION_VERSION   = "4.0.462"
_shared/measure-provider-motion-sync.ts:40  MEASUREMENT_DEADLINE_MS   = 27000
```

## 2. Required deployment set

Files under `supabase/functions/` changed since the v402 compose marker deploy (2026-08-18T20:04:51Z):

```text
_shared/fa4-speaker-cardinality.ts          → importer: sync-so-webhook
_shared/motion-probe-classifier.ts          → importer: sync-so-webhook
_shared/measure-provider-motion-sync.ts     → importers: sync-so-webhook, report-lipsync-motion-probe
_shared/telemetry-target.ts                 → importer: report-lipsync-motion-probe
_shared/noop-retry-preclip.ts               → importer: compose-dialog-segments
_shared/provider-wire-snapshot.ts           → importer: compose-dialog-segments
compose-dialog-segments/index.ts
sync-so-webhook/index.ts
report-lipsync-motion-probe/index.ts
(+ test files only: fa4-v405/v407/v408/v409, motion-probe-classifier, deadline — not deploy-relevant)
```

Deploy set = exactly three functions: `compose-dialog-segments`, `sync-so-webhook`,
`report-lipsync-motion-probe`. No other importer exists for any changed shared module.

Deploy-state caveat: edge function logs are currently empty for `sync-so-webhook` and
`compose-dialog-segments`, so whether the v404 sync-webhook state was ever productively
deployed **cannot be confirmed from logs**. Not assumed either way — the deploy set above is
derived from source-state diff, which is safe regardless of the previous productive marker.

The external Lovable hosting publish is frontend hosting only; it does not create, update or
version Supabase Edge Function deployments. No edge deployment state change attributable to it.

## 3. Diff review (P0/P1 only)

Scope of the diff is confined to the FA-4 v407/v408 wire hardening, the v409 cardinality helper
and its webhook wiring, plus tests. No P0/P1 found: no schema access changes, no new terminal
authority, no retry/mux authority added, no refund path change.

## 4. v408 provider-input wire invariants

`fa4-v408-predeploy.test.ts` (13/13) + `fa4-v407-wire.test.ts` (13/13) executable, all green:
fresh-URL bbox transport, retry inline bbox only, frozen audio/video/boxes/model/sync_mode/run/gen,
positive snapshot persist confirmation (mismatch/rpc-error/rpc-throw ⇒ 0 provider calls), non-NOOP
retry isolation, single-speaker and non-bbox paths unchanged (cases G, H).

## 5. v409 cardinality + residual catch-up

```text
helper  fa4-speaker-cardinality.ts:100-128  ≥2 distinct ⇒ multi; incomplete set ⇒ unknown
                                            (pass_set_incomplete_N_of_M) before single;
                                            legacy 1-pass w/o idx ⇒ single only when total ≤ 1
        :191-200  planPreLockSpeakerMeasurement — measure(multi) | defer(incomplete) | skip
        :155-164  decideCompletedSpeakerBranch — unknown ⇒ ssw:failed /
                  speaker_cardinality_indeterminate

webhook sync-so-webhook/index.ts:716-755  single shared runServerMotionMeasurement()
        :772-782  pre-lock: measure on confirmed multi, defer (log only) on incomplete
        :886-908  fresh re-read under dialog lock → classify on freshest set
        :916-938  still incomplete ⇒ applySyncSegmentResult(ssw:failed,
                  speaker_cardinality_indeterminate), no retry, no mux
        :947-956  planUnderLockSpeakerMeasurement(hasMeasurement) ⇒ catch-up measurement runs
                  exactly once, same metric/threshold/deadline/ROI/rehosted URL
```

Full single-speaker multi-turn sets stay `single` with no server multi measurement (cases L, M).
No duplicate measurement (`hasMeasurement` guard). No new retry/mux authority.

## 6. P1-A/B/C frozen

- P1-A NOOP retry preclip preservation: `_shared/noop-retry-preclip.ts`, sole importer
  `compose-dialog-segments`; covered by v407 case F4 (NOOP activation independent of recomputed
  geometry/model).
- P1-B report endpoint telemetry-only: `report-lipsync-motion-probe` owns no scene/pass state
  (lines 16, 118-218), fail-closed telemetry key, no verdict.
- P1-C true global measurement deadline: `MEASUREMENT_DEADLINE_MS = 27000`, applied at
  `measure-provider-motion-sync.ts:316`.

## 7. Ownership unchanged

G3.2.2 `applySyncSegmentResult` remains the sole terminal-state apply; mux dispatch stays
exactly-once via `acquireLedgerJob('audio_mux')` in `settleVerdict`; finalizer ownership untouched.

## 8. Test results

```text
_shared/fa4-v407-wire.test.ts                       13 passed | 0 failed
_shared/fa4-v408-predeploy.test.ts                  13 passed | 0 failed
_shared/fa4-v409-speaker-cardinality.test.ts        20 passed | 0 failed
_shared/motion-probe-classifier.test.ts              7 passed | 0 failed
_shared/measure-provider-motion-sync.deadline.test.ts   BLOCKED (env-local)
_shared/fa4-v405-matrix.test.ts                         BLOCKED (env-local)
```

Both blocked suites fail identically at module load: `Could not find a matching package for
'npm:jpeg-js@0.4.4' in the node_modules directory` — sandbox-local resolution only, no source
defect. Dependencies untouched.

## 9. Deployment order (do NOT execute yet)

1. `report-lipsync-motion-probe` (telemetry-only, no consumers depend on it)
2. `compose-dialog-segments` (producer: v408 wire + snapshot persist)
3. `sync-so-webhook` (consumer: v409 cardinality + catch-up measurement) — last, so no window
   exists where the new consumer runs against the old producer wire.

Post-deploy markers to look for (logs, read-only):

```text
compose-dialog-segments   BOOT / version=v408-fa4-predeploy-final
sync-so-webhook           v409-fa4-speaker-cardinality-final speaker_cardinality scene=… class=…
sync-so-webhook           v409… motion_measure_deferred …           (race window observed)
sync-so-webhook           v409… server_motion_measure … phase=pre_lock | under_lock_catch_up
report-lipsync-motion-probe  v404_telemetry scene=…
absent expected:          motion_probe_indeterminate:measurement_missing
```

## Result

No P0/P1 remaining in scope.
