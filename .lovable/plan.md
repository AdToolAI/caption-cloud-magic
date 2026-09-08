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

## C) Follow-up: Seedance 2.5 reference-image 400s (test user)

Test user, last 7 days, Seedance 2.5 reference mode: 12 failed / 2 completed. Failed = 10 × `InputImageSensitiveContentDetected.PrivacyInformation` ("input image 'content[N]' may contain real person"), 2 × copyright (post-processing). Globally (30d, all accounts): reference mode 11 completed / 18 failed; every create-time 400 in reference mode is the same privacy code (13 × content[1], 2 × content[2]); the other 3 accounts show the identical pattern. Zero `InvalidParameter` errors in reference mode except one v2v run (start image + reference media mixed, 17:35 UTC on 09-07, now blocked by today's preflight).

Is the request built correctly? Yes. `_shared/modelark.ts` sends `content[0]` = text, `content[1..n]` = `image_url` with `role: reference_image`, videos/audio after; ratio/resolution are documented body fields; no duplicate slots, no MIME/URL errors (an unreachable or malformed URL would return `InvalidParameter … downloading image`, seen only twice for a 152 px-wide image on 08-30). The index in ModelArk's message maps 1:1 to the uploaded reference order, so `content[1]` = the user's first reference photo, `content[2]` = second.

Verdict: the user is doing something the provider does not allow — using photos of real people as Seedance 2.5 reference images. ByteDance rejects these before creating a task (no provider cost, refund already issued each time). The same user's 2 successful reference runs and identical-prompt retries that later succeeded indicate that only the flagged photo differs. Same prompt template was retried up to 5× with the same result.

Current UX gap: the message the user sees is the generic "rejected for content or copyright reasons — adjust prompt or image" (`videoImageRequirements.ts`); the client already knows the class `real_person_image` but does not tell the user WHICH image (index) or WHY (real person), and does not stop identical resubmission.

Preventable checks / UX changes needed:
1. Map `content[N]` to the reference slot and highlight that thumbnail with a specific text: "Seedance 2.5 rejects photos of real people as references (provider policy). Remove or replace image N."
2. Pre-submission screen: run the existing face detector (`_shared/plate-face-detect.ts` / `validate-frame-face`) on Seedance 2.5 reference images and warn before charging; treat as warning, not hard block, because the provider filter is the authority.
3. Offer a route hint in the warning to models whose provider permits person references (to be verified per route before naming one — not from documentation).
4. Client-side resubmission guard: identical reference set + prompt after a privacy rejection → require a change before the button re-enables.
5. Extend preflight with ModelArk image floor (≥ 300 px shorter side) so the 08-30 class cannot recur.

## Highest-priority fixes (proposed, not executed)
1. Route `autopilotCredits.refundStage` through an RPC with a deterministic key (`autopilot:<production>:<stage>:<scene>`), remove direct wallet writes.
2. Cap `v459_refund_lipsync_euros` per source debit (refund ≤ debit − prior refunds referencing it).
3. Store the charged amount on the refund (bound to original charge) so discount drift cannot over/under-refund.
4. Preflight image constraints before wallet/provider: min 300 px (ModelArk), reference aspect 0.4–2.5 (Kling Omni).
5. Section C items 1–4: slot-specific real-person message, face pre-screen, resubmission guard; plus brand/franchise-term warning for copyright rejections.
6. Verify ModelArk billing for failed copyright tasks; if billed, factor into Seedance 2.5 margin.

Note: roadmap.md was not updated because this turn is read-only; the follow-up task is captured in this report.
