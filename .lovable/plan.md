

## r16 — Rate Limit Retry (DEPLOYED)

### Problem
After r13–r15 fixed the payload contract (frameRange, audioCodec, envVariables), Lambda now starts correctly but hits AWS concurrency limits: `"AWS Concurrency limit reached (Original Error: Rate Exceeded)"`. The invoke function treated this as a fatal error with no retry.

### Changes

1. **Backend: `invoke-remotion-render/index.ts`**
   - Wrapped Lambda invocation in retry loop (max 3 retries)
   - Exponential backoff: 5s → 10s → 20s
   - Detects rate-limit errors in both HTTP status (429) AND response body ("Rate Exceeded", "Concurrency limit", "TooManyRequestsException", "Throttling")
   - Logs `rate_limit_retry_attempt: N/3` for each retry
   - Only treats as fatal after all retries exhausted

2. **Frontend: `UniversalAutoGenerationProgress.tsx`**
   - Added `Rate Exceeded` and `Concurrency limit` to `isRetryableError` pattern
   - These are transient errors — no diagnostic profile change needed

3. **Canary: `remotion-payload.ts`**
   - `bundle_canary` → `r16-rateLimitRetry`
   - `bundle_probe` → `canary=2026-03-04-r16-rateLimitRetry`
