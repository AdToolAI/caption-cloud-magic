

# Fix: "Cannot access 'supabaseUrl' before initialization"

## Problem

In `supabase/functions/auto-generate-universal-video/index.ts`, the function `runGenerationPipeline` declares `const supabaseUrl` twice:

- **Line 118**: First declaration (at function start)
- **Line 563**: Second declaration (added during the delegated render refactor)

JavaScript/TypeScript `const` declarations are hoisted to the top of their enclosing scope but remain in the "Temporal Dead Zone" (TDZ) until executed. Because line 563's declaration is in the same function scope, the engine sees it during hoisting, which shadows the line 118 declaration. When line 126 tries to use `supabaseUrl`, the TDZ kicks in and throws:

```
ReferenceError: Cannot access 'supabaseUrl' before initialization
```

This is why the error occurs immediately at 5% -- before any actual work begins.

## Fix

**File**: `supabase/functions/auto-generate-universal-video/index.ts`

Remove the duplicate declarations at lines 563-564. The variables `supabaseUrl` and `supabaseServiceKey` (aliased as `serviceRoleKey`) are already available from lines 118-119.

```
// Line 563-564: REMOVE these two lines
const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
```

Then update line 574 to use `supabaseServiceKey` (the existing variable name from line 119) instead of `serviceRoleKey`:

```
'Authorization': `Bearer ${supabaseServiceKey}`,
```

This is a one-line cause, one-line fix. No other files need changes. After fixing, the function will be redeployed.

