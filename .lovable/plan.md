

# Fix: `functionStartTime is not defined`

## Problem

The error is a simple scoping issue. `functionStartTime` and `FUNCTION_TIMEOUT_MS` are defined inside the `serve()` handler (line 114-115), but `generateSceneVisual` runs inside `runGenerationPipeline()` — a standalone function defined at line 473, **outside** the `serve()` closure. So `functionStartTime` is not in scope.

## Fix

Add a `pipelineStartTime` at the top of `runGenerationPipeline` and use it instead of `functionStartTime` inside `generateSceneVisual`. This is actually more accurate since the pipeline starts via `EdgeRuntime.waitUntil()` shortly after the request handler returns.

**File:** `supabase/functions/auto-generate-universal-video/index.ts`

1. **Line ~484 (inside `runGenerationPipeline`, after `try {`):** Add `const functionStartTime = Date.now();` and `const FUNCTION_TIMEOUT_MS = 280_000;`
2. No other changes needed — `generateSceneVisual` already references these variable names correctly, they just need to exist in the enclosing function scope.

**One-line fix, zero risk.**

