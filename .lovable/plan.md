## Problem

Edge function deploys keep failing intermittently with:
```
Failed to bundle the function (reason: Fetch 'https://esm.sh/...' timed out after 10s)
```

So far we've fixed `credit-reserve` and `grant-welcome-bonus` one at a time, but **321 edge function files still import `@supabase/supabase-js` from `esm.sh`**, plus a handful of other packages (`stripe`, `resend`, `replicate`, `jszip`, `fast-xml-parser`, `aws4fetch`). Any future deploy can hit the same timeout on a different function — that's why "the error keeps coming back."

## Fix

Do a one-shot bulk rewrite of all `https://esm.sh/<pkg>@<ver>` imports to `npm:<pkg>@<ver>` in `supabase/functions/`. The `npm:` specifier is the supported, stable resolver in Supabase Edge Runtime and avoids the flaky esm.sh CDN fetch during bundling.

### Scope of replacements (distinct URLs found)

| esm.sh URL | Replacement |
|---|---|
| `https://esm.sh/@supabase/supabase-js@<ver>` (10 versions: 2, 2.7.1, 2.39.0, 2.39.3, 2.45.0, 2.49.1, 2.49.4, 2.57.0, 2.57.2, 2.75.0, 2.95.0) | `npm:@supabase/supabase-js@<ver>` |
| `https://esm.sh/stripe@14.21.0` / `@18.5.0` | `npm:stripe@...` |
| `https://esm.sh/resend@2.0.0` | `npm:resend@2.0.0` |
| `https://esm.sh/replicate@0.25.2` | `npm:replicate@0.25.2` |
| `https://esm.sh/jszip@3.10.1` | `npm:jszip@3.10.1` |
| `https://esm.sh/fast-xml-parser@4.5.0` | `npm:fast-xml-parser@4.5.0` |
| `https://esm.sh/aws4fetch@1.0.18` | `npm:aws4fetch@1.0.18` |

### Steps

1. Run a single `sed`-based rewrite over all `*.ts` files in `supabase/functions/` replacing the prefix `https://esm.sh/` with `npm:` (only inside import statement string literals).
2. Verify with `rg` that no `esm.sh/...` import remains.
3. Do NOT mass-redeploy all functions (~300+). The next deploy of any changed/touched function will pick up the new imports automatically. We'll redeploy the currently failing one (`grant-welcome-bonus` if it re-fails, or whichever is reported next) explicitly to confirm.
4. If `supabase/functions/deno.lock` exists and references esm.sh URLs, delete it so the runtime regenerates a clean lockfile (per the deploy-error troubleshooting guide).

### Out of scope

- Frontend `src/` imports (not affected by edge bundler).
- Switching versions or upgrading SDKs — keep all version pins identical, only the resolver changes.
- The `_shared/*` helper files are included in the rewrite (same `supabase/functions/` tree).

### Risk

Very low. `npm:` specifiers are the documented Supabase Edge Runtime pattern and we've already verified the swap works for `credit-reserve` and `grant-welcome-bonus`. Versions remain pinned so behavior is unchanged.
