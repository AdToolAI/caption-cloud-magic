
# Fix: CORS-Fehler bei invoke-remotion-render

## Problem

Die Phase-2-Architektur funktioniert korrekt bis zum Punkt, an dem der Client `invoke-remotion-render` aufruft. Der Browser blockiert den Request wegen fehlender CORS-Headers. Im Screenshot sichtbar:

```
Access to fetch at '.../invoke-remotion-render' from origin 'https://useadtool.ai'
has been blocked by CORS policy: No 'Access-Control-Allow-Origin' header
```

## Ursache

Die `corsHeaders` in `invoke-remotion-render/index.ts` enthalten nur die alten Headers:
```
authorization, x-client-info, apikey, content-type
```

Moderne Supabase JS Clients senden aber zusaetzlich:
- `x-supabase-client-platform`
- `x-supabase-client-platform-version`
- `x-supabase-client-runtime`
- `x-supabase-client-runtime-version`

Wenn diese nicht im `Access-Control-Allow-Headers` stehen, schlaegt die OPTIONS-Preflight-Anfrage fehl und der eigentliche POST wird nie gesendet.

## Loesung

Eine einzige Zeile aendern in `supabase/functions/invoke-remotion-render/index.ts` (Zeile 7):

```typescript
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};
```

## Dateien die geaendert werden

1. **EDIT**: `supabase/functions/invoke-remotion-render/index.ts` -- CORS-Headers um Supabase-Client-Platform-Headers erweitern (nur Zeile 7)
