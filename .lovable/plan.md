# Read-only Audit: Refund Safety + Video Failure Forensics (2026-09-08)

No code, data, secrets or deployments were changed. Evidence = live DB function definitions, indexes, ledger rows, `ai_video_generations` (173 runs / 30d, 124 / 7d, 13 accounts) and current edge-function sources.

## A) Refund safety — verified state

Guarantees in place (verified in live definitions):
- `refund_ai_video_credits`: key = `p_refund_key` or default `gen:<generation_id>:failure`; pre-check + unique partial index `ai_video_transactions_refund_key_uniq` + `unique_violation` catch. Duplicate = no-op.
- All 23 generator/poller/webhook callers pass `p_generation_id` (default key applies); `modelark-poll`, `replicate-webhook` and generator catch blocks all resolve to the same key per run -> at most one failure refund per generation.
- `composer_refund_charge`: keyed on `refund_charge_id` (unique index) — one refund per charge row.
- `composer_refund_scene_run`: key `gen:<scene>:<run>:<reason>`, amount capped at matching charge minus prior refunds.
- `composer_settle/release_run_reservation`: `FOR UPDATE` + `status='reserved'` guard — idempotent.
- Ledger proof: since the key-writing function went live (first keyed row 10:45:59 UTC today) there is 1 refund, keyed, no duplicate. All 18 pre-fix duplicate generations (raw over-refund 131.00) are reconciled: 117.69 corrected, 13.31 recorded as open correction — sums match exactly.

Residual risks (not happy-path):
1. `_shared/autopilotCredits.ts refundStage` — refund path OUTSIDE `refund_ai_video_credits`: read-modify-write on `ai_video_wallets`, direct `ai_video_transactions` insert, idempotency only via `description ILIKE` prefix, no unique constraint, no lock. Concurrent calls can refund twice and lose updates. Severity: medium (Autopilot volume currently low).
2. `v459_refund_lipsync_euros` fallback: if no debit carries `metadata.run_id`, it falls back to the latest scene-scoped debit; key includes the run id, so two different failed runs can each refund the SAME debit in full. Severity: medium.
3. Discount-factor drift: `refund_ai_video_credits` recomputes `list × get_ai_discount_factor(now)`; a founder discount expiring between charge and refund yields refund ≠ charge (no cap to original charge). Severity: low-medium.
4. Legacy unkeyed rows (107 historical refunds without key): a manual re-fail/recovery of a pre-fix generation would not see the old refund and would credit again. No such generation is currently non-terminal, so risk is dormant; a keyed backfill is not possible without evidence.
5. Composer legacy no-run-id path: key `gen:<scene>:<reason>` is at-most-once -> cannot double-refund, but a second legitimately charged attempt without run id is under-refunded (documented, accepted).
6. Direct wallet increments outside refunds: `grant-welcome-bonus`, `process-winback-emails`, `admin-create-creator-account` write balances directly (grants, not refunds); guarded only by application-level checks, not DB uniqueness.
7. Enhance `release` + `true_up_refund` are two legitimate keys per run; nothing in the DB caps their sum to the reservation — relies on caller math.

## B) Failure forensics (30d / 7d)

Terminal failure rate: 30d 60/173 = 34.7%; 7d 52/124 = 41.9%.
By model 30d (7d): seedance-2-5 48/121 = 39.7% (44/87 = 50.6%); seedance-pro 8/18 = 44% (same); veo-3.1-fast 2/8; kling-omni 2/3; kling-3 0/12; kling-2.6, wan-2-6-pro, ltx, grok, seedance-standard 0 failures. All non-Seedance: 4/34 = 11.8%, none moderation.

Failure classes (30d):
- Provider moderation 48/60 = 80%: copyright output 27 (all Seedance 2.5 except 1 Pro, avg 19s, 720p, 26/27 9:16), real-person image privacy filter 18 (ModelArk create 400 `InputImageSensitiveContentDetected.PrivacyInformation`; 12 of them from one prompt template "use photo as main character…", 10/11 failed), Replicate "flagged as sensitive" 3.
- Preventable pre-submission 8/60 = 13%: prompt > 4000 chars 3 (Replicate 422, Seedance Pro), image too small (152px, ModelArk min 300px) 2, Kling Omni reference aspect ratio outside 0.4–2.5 2, first/last-frame + reference mix 1. Prompt length and slot mix are covered by today's preflight; image dimension/aspect checks are NOT.
- Provider capacity/timeout 4/60: Veo "high load" 2, Seedance Pro E003 1, ModelArk task timeout 1 (30s clip).
- Webhook/reconcile, storage, wallet, unknown: 0.
Moderation-only failure rate: 48/173 = 27.7%. Platform-attributable excluding moderation: 12/173 = 6.9% (8 of those preventable).

Does the "mostly moderation" claim hold beyond the test account? Yes, but weaker: test account = 80/173 runs, 34 failures (42.5%). Excluding it: 93 runs, 26 failures = 28.0%, of which 19/26 = 73% moderation (13 copyright, 6 privacy). Copyright rejections hit 5 different accounts.

Pipeline contribution to moderation (hypothesis test):
- Every Studio prompt gets a client-appended "no text/no logos" clause (140/140) and most a spoken-language clause; both appear equally in successes and failures -> not discriminating. Server adds an ambience-only clause only when audio on + dialogue suppressed. No prompt enhancement / hidden system prefix found.
- Markdown-style prompts: 69% of failed vs 68% of completed -> no signal.
- Brand/franchise names: 27% of copyright failures vs 7% of completed -> real signal.
- Length: copyright failures avg 4210 chars vs 3111 completed, but present in every length bucket -> weak signal.
- Duration: copyright rate 0% ≤10s, 32% at 11–15s, 12% at 16–20s, 27% >20s -> longer clips more exposed, not monotonic.
- Reference handling: privacy failures are entirely real-person photos in reference slots; duplicates/wrong MIME/URL not observed. Route/model mismatches: 0.
Conclusion: moderation is provider-side; our pipeline does not add flagged content, but we do not warn before submission.

Retry behaviour: identical requests re-sent after copyright 9/27 (4 later succeeded — moderation is non-deterministic), after privacy 11/18 (4 succeeded, likely with different image), sensitive 3/3 succeeded on retry, image-dims 2 retried, 0 succeeded. Users did loop identical rejected prompts (one prompt 5× failed over 3.4 h; several 2–3× within 1 minute).

Provider cost of moderation failures: 23 create-time 400s (privacy/dims/slot) never created a task -> no provider cost. The 27 copyright rejections happen after processing; the system holds no provider billing data, so cost is UNVERIFIED (check ModelArk console).

Uncertainties: ledger-linked failure stage relies on error text; `parity_mode` is NULL on 58% of runs (pre-parity rows), so mode split is partial; 30d ≈ 7d because volume is recent.

## Highest-priority fixes (proposed, not executed)
1. Route `autopilotCredits.refundStage` through an RPC with a deterministic key (`autopilot:<production>:<stage>:<scene>`), remove direct wallet writes.
2. Cap `v459_refund_lipsync_euros` per source debit (refund ≤ debit − prior refunds referencing it).
3. Store the charged amount on the refund (bound to original charge) so discount drift cannot over/under-refund.
4. Preflight image constraints before wallet/provider: min 300 px (ModelArk), reference aspect 0.4–2.5 (Kling Omni).
5. Pre-submission warnings for real-person photos in Seedance reference slots and brand/franchise terms; block identical resubmission of a copyright/privacy-rejected request without change.
6. Verify ModelArk billing for failed copyright tasks; if billed, factor into Seedance 2.5 margin.
