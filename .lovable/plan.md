

# Fix: CORS-Headers für companion-diagnose & check-subscription

## Problem

Aus dem Screenshot: Beide Funktionen werden durch CORS blockiert, weil der Supabase JS-Client neuere Headers sendet, die nicht in `Access-Control-Allow-Headers` erlaubt sind.

Zusätzlich treten 504 Gateway Timeouts auf — wahrscheinlich weil die CORS-Preflight-Anfrage zwar durchkommt, aber der eigentliche Request wegen fehlender Headers abgelehnt wird.

## Fix

Beide Funktionen brauchen die erweiterten CORS-Headers:

```typescript
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};
```

## Dateien

| Datei | Änderung |
|-------|----------|
| `supabase/functions/companion-diagnose/index.ts` | CORS-Headers erweitern |
| `supabase/functions/check-subscription/index.ts` | CORS-Headers erweitern |

Kleiner, gezielter Fix — keine Logik-Änderungen nötig.

