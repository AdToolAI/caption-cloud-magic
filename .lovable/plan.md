## Deep Sweep v4 — Fix the 6 remaining failures

I traced every red row in the screenshot to its exact root cause. Each is a small, isolated bug — no architectural change needed.

### Diagnosis

| # | Flow | Real cause |
|---|---|---|
| 1 | Composer Stitch | Orchestrator inserts `prompt` into `composer_scenes`, but the column is named **`ai_prompt`**. Schema cache rejects the insert. |
| 2 | Director's Cut Render | `render-directors-cut` validates the user JWT via `auth.getUser()` and has **no `detectQaServiceAuth` shortcut**, so the service-role call returns 401. |
| 3 | Auto-Director | Same root cause as #2 — `auto-director-compose` lacks the QA service-auth shortcut → 401 UNAUTHORIZED. |
| 4 | Talking Head (Hedra) | `hedra/character-3` **no longer exists on Replicate** (verified: `GET /v1/models/hedra/character-3` → 404 "Model not found"). Hedra was removed from Replicate's catalog. |
| 6 | Long-Form Render | `render-long-form-video` calls `render-directors-cut` (or the same Lambda layer) internally and propagates the same 401. Same root cause as #2. |
| 7 | Magic Edit (FLUX Fill) | The `qa-test-assets` bucket is **private** and contains only 3 files (no `sample-mask-512.png`). Replicate fetches the mask via public URL and gets 400. Bootstrap was never re-run after the mask logic was added. |

### Fix list

**Code (orchestrator)**
- `supabase/functions/qa-weekly-deep-sweep/index.ts`
  - Flow 1: rename `prompt:` → `ai_prompt:` in the seed scene rows.
  - Flow 4: degrade gracefully — if the talking-head call returns 404 / "Model not found" / "resource could not be found", mark the flow as `budget_skipped` with a clear note ("Hedra Replicate model removed — flow disabled until provider migration") instead of `failed`. This stops the noise while we sort out the provider.
  - Flow 7: before calling `magic-edit-image`, generate a **signed URL** for the mask (and for the source image) via `admin.storage.from('qa-test-assets').createSignedUrl(path, 600)` instead of the public URL. Same for the source image since the bucket is private.

**Service-role auth shortcut on the 3 missing functions**
Add the same minimal block we already use in `generate-talking-head` and `magic-edit-image`:
```ts
import { detectQaServiceAuth } from "../_shared/qaServiceAuth.ts";
// inside the handler, BEFORE the regular getUser flow:
const qaSvc = detectQaServiceAuth(req);
let user = qaSvc.isQaService && qaSvc.userId ? { id: qaSvc.userId } : null;
if (!user) { /* existing JWT validation path */ }
```
- `supabase/functions/render-directors-cut/index.ts`
- `supabase/functions/auto-director-compose/index.ts`
- `supabase/functions/render-long-form-video/index.ts`

Also add `x-qa-real-spend, x-qa-user-id` to each function's `Access-Control-Allow-Headers`.

**Bootstrap**
- Re-deploy `qa-live-sweep-bootstrap` (no code change needed — already creates `sample-mask-512.png`) and **the user must click "Bootstrap Assets"** once before the next Deep Sweep run. I'll add a clear hint in the Cockpit Deep Sweep tab: *"Run Bootstrap Assets once before the first Deep Sweep."*

**Memory**
- Update `mem://features/qa-agent/deep-sweep` to record:
  - Hedra Replicate model removed (April 2026) — Flow 4 currently auto-skips.
  - QA service-auth must be wired into every long-running pipeline endpoint the orchestrator calls.
  - `qa-test-assets` bucket is private → always use signed URLs when handing assets to external providers.

### Expected outcome after deploy

| Flow | Expected status |
|---|---|
| 1 Composer Stitch | success (stitches 3 sample clips into one MP4) |
| 2 Director's Cut Lambda | success (full Lambda render, ~60–120 s) |
| 3 Auto-Director | success |
| 4 Talking Head | `budget_skipped` with note "Hedra Replicate model removed" |
| 5 Universal Video | success (already green) |
| 6 Long-Form Lambda | success |
| 7 Magic Edit | success (mask now reachable via signed URL) |

Estimated spend: **~7–10 €** (Flow 4 spends 0 €).

### Files touched

- `supabase/functions/qa-weekly-deep-sweep/index.ts` — column fix, Flow 4 graceful skip, Flow 7 signed URLs
- `supabase/functions/render-directors-cut/index.ts` — add QA service-auth shortcut
- `supabase/functions/auto-director-compose/index.ts` — add QA service-auth shortcut
- `supabase/functions/render-long-form-video/index.ts` — add QA service-auth shortcut
- `src/pages/admin/DeepSweepTab.tsx` — small hint about bootstrap prerequisite
- `mem://features/qa-agent/deep-sweep` — record current limits
- (Re-)deploy all four edge functions

### Out of scope (separate follow-up)

Migrating the Talking Head pipeline off Hedra-on-Replicate (either to Hedra's native API with a new `HEDRA_API_KEY` secret or to a Replicate alternative). I'll surface this as a clear next step after this fix lands so you can decide.