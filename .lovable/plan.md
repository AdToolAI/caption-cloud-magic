# V531-OBS Production Activation Check — Read-Only Monitoring

Strictly read-only. No edits, no deploys, no retries, no DB writes. Nothing is implemented, only observed and reported.

## Trigger

You start the next multi-speaker production scene run and tell me (with the run ID if you have it). If no run ID is given, I identify the newest run by taking the most recent observations after your start signal and grouping by their run.

## Step 1 — Answer the single gating question

Query the observation ledger for the new run only and check whether any of the five V531 verdicts appear from handler `sync-so-webhook` / `lipsync-watchdog`:

- `motion_measure_start`
- `motion_measure_done`
- `motion_measure_error`
- `apply_not_confirmed`
- `lock_phase_io_rounds_exhausted`

Decision rule:

- At least one such verdict for the new run: V531-OBS is proven active in production. Continue to Step 2.
- Sync.so callbacks arrive (COMPLETED, `bound` rows present) but zero V531 verdicts: STOP the RCA and report "V531-OBS production activation is not proven". No further analysis, no fix.
- No callbacks at all: report inconclusive (no traffic), same as before.

## Step 2 — Only if active: six-job comparison

Chronological table for every observation of the run:

```text
observed_at | handler | external_job_id | pipeline_job_id | verdict | details
```

Then a per-job comparison across all six Sync.so jobs:

- `pass_idx`
- motion measurement start / end timestamps and derived duration
- attempts, `v466_remeasured`, `measurement_status`
- final verdict, any `motion_measure_error`
- `ack_state`, `ack_unknown_cause`, `ack_reason`
- any `apply_not_confirmed` or `lock_phase_io_rounds_exhausted`

## Data sources

- `composer_callback_observations` (read-only selects, filtered by `run_id` and `observed_at`)
- Edge function logs for `sync-so-webhook` and `lipsync-watchdog` as corroboration only
- Pipeline job rows read-only for `pass_idx` / ack fields not carried in `details`

## Deliverable

One report: activation verdict first, then (if active) the chronological ledger and the six-job comparison. No fix proposal unless you ask for one in a later gate.
