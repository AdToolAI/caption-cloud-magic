## Root cause

`briefing-deep-parse` runs **two Gemini 2.5 Pro calls in series** (Pass A extraction + Pass B resolution). There is **no `[functions.briefing-deep-parse]` block** in `supabase/config.toml`, so it inherits the default **30 s edge-function timeout**.

A 15 s briefing with full director details produces ~6–8k input tokens → Pass A alone with Gemini 2.5 Pro regularly needs 20–40 s. Combined the two passes blow past 30 s. The Edge runtime kills the function before it can respond, the client gets a non-2xx → `useStoryboardTransition` correctly falls back to `buildLocalFallbackPlan` (the generic "Hook beat for AdTool AI : cinematic establishing shot in a relevant setting" you see).

The progress bar stalling exactly at "Pass B 88 %" matches the fake client-side ticker reaching its cap while the server is being torn down.

The lip-sync pipeline (`compose-dialog-segments` v169) is **not affected** — only the briefing parser.

## Fix (3 small, isolated changes)

### 1. Raise the function timeout

Add an explicit block to `supabase/config.toml`:

```toml
[functions.briefing-deep-parse]
verify_jwt = true
timeout_sec = 300
```

### 2. Make Pass B fast & resilient

In `supabase/functions/briefing-deep-parse/index.ts`:

- Switch Pass B model from `google/gemini-2.5-pro` → `google/gemini-2.5-flash`. Resolution is mechanical mention-matching; Flash handles it in ~3-6 s.
- Wrap **each** gateway call in an internal `AbortController` budget (Pass A: 90 s, Pass B: 45 s) so a single hung call can never starve the whole function. On abort → log + fall through to existing local resolution / safety arc (already implemented).
- Trim the Pass B payload: send only `{id, name}` for characters/locations (no extras) — already mostly the case, just enforce.

### 3. Honest client progress + better error surfacing

In `src/hooks/useStoryboardTransition.ts`:

- Cap the fake progress at 70 % until the real response arrives (so the "stuck at 88 %" illusion goes away).
- When the fallback fires, include the actual HTTP status / error message in the toast description (e.g. "Auto-Analyse offline · timeout 30 s — Basis-Plan erstellt") so we can diagnose future regressions without guessing.

## Explicitly NOT touched

- `compose-dialog-segments` (v169 lip-sync pipeline)
- `compose-video-clips`
- Single-speaker safety net / identity bridge
- Prompt sanitizer & "Hard Rule" face-occlusion guard
- `briefing-deep-parse` Pass A model (stays Gemini 2.5 Pro for director quality)
- Plan schema / `ProductionPlanSheet` UI

## Expected result

After redeploy: full briefing (15 s, 3 scenes, named cast, voice IDs, shot director) ends up in the Production Plan instead of the generic safety arc, in well under 60 s. Storyboard auto-applies the real plan. Lip-sync path is untouched.