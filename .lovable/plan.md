## Deep Sweep v5 — fix the 3 remaining red rows

Three independent, isolated bugs. None affect end users; all live in the QA pipeline (orchestrator + 2 edge functions called by it).

### Diagnosis

| # | Flow | Real cause |
|---|---|---|
| 1 | Composer Multi-Scene Stitch | `compose-stitch-and-handoff/index.ts` does **not** have the `detectQaServiceAuth` shortcut yet. It validates the JWT via `userClient.auth.getUser()` and the service-role token is rejected → `401 Unauthorized`. (We added the shortcut to the other long-running endpoints last round but missed this one.) |
| 2 | Director's Cut Lambda Render | `render-directors-cut` payload uses snake_case `subtitle_track.clips[].start_time / end_time`, but the Remotion composition `DirectorsCutVideo.tsx` reads `clip.startTime / clip.endTime` (line 751-752). `undefined * fps = NaN` → `Math.floor(NaN) = NaN` → `<Sequence from={NaN}>` → Lambda crashes with the exact error in the screenshot. The render is *triggered* successfully (orchestrator says trigger ok), then Lambda dies during composition. |
| 6 | Long-Form Render (Lambda) | `render-long-form-video` returns `Project not found` because the orchestrator's seeded scene has `status: 'completed'` and `cost_euros: 0` — that part is fine — but the function's project lookup uses the service-role admin client. The actual cause is that **the orchestrator's `finally` block in `flowLongFormRender` deletes the project too aggressively**: when the synchronous `render-long-form-video` call returns 200 (it returns `status: 'rendering'` immediately), the orchestrator polls for completion in a separate downstream call (`render-with-remotion`), which *re-fetches* the project from `sora_long_form_projects`. By then the orchestrator has already moved on, but the `finally` is on the outer flow. Looking again: the immediate 500 ("Project not found") comes from `render-long-form-video` itself on its first `select('*').eq('id', projectId).single()`. **Root cause**: the orchestrator's INSERT uses the service-role admin client and returns `proj.id`, but `render-long-form-video` is invoked with the body `{ projectId: proj.id }`. The function's first DB call is `from('sora_long_form_projects').select('*').eq('id', projectId).single()`. Service role bypasses RLS. The only way `single()` returns "not found" here is if the projectId is *not actually persisted yet* — the previous flow's `await ctx.admin.from('sora_long_form_projects').insert(...).select().single()` does persist immediately, BUT the previous deep-sweep `qa-deep-sweep-longform-*` rows from earlier failed runs were left behind and the unique-name index (or RLS write-guard) is causing the new insert to silently swallow. Reading the code carefully one more time: the insert uses `.select().single()` and explicitly checks `projErr || !proj` — that branch returned ok, so projectId is real. **The actual problem**: `render-long-form-video` reads `project.user_id` and forwards it as `userId` to `render-with-remotion`, but in QA service-auth mode the orchestrator already overrides this with `qaSvc.userId`. The "Project not found" message is the literal text thrown when the *downstream* `render-with-remotion` fails to find the project in *its* table (likely a different table or the same table with stricter RLS). The fix is to add the same QA service-auth shortcut to `compose-stitch-and-handoff`, fix the snake/camel mismatch in render-directors-cut's subtitle payload normalization, and have `render-long-form-video` log the actual failing query so we can confirm — but the safest concrete fix is to **normalize the subtitle clip keys to camelCase before passing to Lambda** and **add the auth shortcut to compose-stitch-and-handoff**, then re-run; if Flow 6 still fails, the error message will tell us exactly which downstream call returned "Project not found".

### Fix list

**Code changes**

1. `supabase/functions/compose-stitch-and-handoff/index.ts`
   - Add `import { detectQaServiceAuth } from "../_shared/qaServiceAuth.ts";`
   - Add `x-qa-real-spend, x-qa-user-id` to `Access-Control-Allow-Headers`.
   - Insert the QA service-auth shortcut before the existing `userClient.auth.getUser()` call.

2. `supabase/functions/render-directors-cut/index.ts`
   - Right after destructuring `subtitle_track` from the body, normalize each clip:
     ```ts
     if (subtitle_track?.clips?.length) {
       subtitle_track.clips = subtitle_track.clips.map((c: any, i: number) => ({
         id: c.id ?? `clip-${i}`,
         text: c.text ?? '',
         startTime: Number(c.startTime ?? c.start_time ?? 0),
         endTime: Number(c.endTime ?? c.end_time ?? 0),
         ...c,
       }));
     }
     ```
     Same normalization for `text_overlays` (also reads `.startTime`/`.endTime` in the composition). This eliminates the `NaN` and is backward-compatible with the existing camelCase callers.

3. `supabase/functions/render-long-form-video/index.ts`
   - Improve the "Project not found" error to include both `projectError?.message` and the projectId, so the next run reveals the true cause:
     ```ts
     if (projectError || !project) {
       throw new Error(`Project not found (id=${projectId}, err=${projectError?.message ?? 'no row'})`);
     }
     ```
   - Also wrap the downstream `render-with-remotion` failure text the same way (it currently throws `Remotion render failed: {"error":"Project not found"}` without saying which projectId). This is observability-only and makes the next deep-sweep self-diagnose Flow 6 definitively.

4. `supabase/functions/qa-weekly-deep-sweep/index.ts`
   - In `flowLongFormRender`, after seeding `proj`, do an explicit `select('id').eq('id', proj.id).maybeSingle()` and log the result before calling `render-long-form-video`. If that returns null, the seed silently failed (RLS / trigger). One log line, no behavior change otherwise.
   - In Flow 2 (`flowDirectorsCutRender`), keep the snake_case payload — the fix is on the receiving end (#2 above).

**Deploy**

- `compose-stitch-and-handoff`
- `render-directors-cut`
- `render-long-form-video`
- `qa-weekly-deep-sweep`

**Memory**

- Update `mem://features/qa-agent/deep-sweep`: every Lambda composition expects camelCase keys (`startTime`/`endTime`); render-directors-cut now normalizes both casings server-side. Service-auth must be wired into every endpoint the orchestrator calls — `compose-stitch-and-handoff` was the last gap.

### Expected outcome after deploy

| Flow | Expected status |
|---|---|
| 1 Composer Stitch | success |
| 2 Director's Cut Lambda | success (no more NaN) |
| 3 Auto-Director | success |
| 4 Talking Head | `budget_skipped` (Hedra removed — known) |
| 5 Universal Video | success |
| 6 Long-Form Lambda | success **OR** a self-explanatory error message that tells us exactly which row is missing |
| 7 Magic Edit | success (after Bootstrap Assets) |

Estimated spend: 7-10 €.

### Out of scope

- Migrating Talking Head off Hedra (separate decision).
- Refactoring the snake/camel split across the whole Remotion stack — we only normalize at the API boundary for now.
