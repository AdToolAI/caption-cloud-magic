

# Fix: CORS-Fehler bei auto-generate-universal-video

## Problem

Die CORS-Preflight-Anfrage (OPTIONS) schlaegt fehl, weil der Supabase JS Client neuere Headers sendet (`x-supabase-client-platform`, `x-supabase-client-platform-version`, etc.), die in der `Access-Control-Allow-Headers`-Liste der Edge Function nicht enthalten sind. Der Browser blockiert deshalb die gesamte Anfrage.

## Loesung

Die `corsHeaders` in `auto-generate-universal-video/index.ts` muessen aktualisiert werden, um alle vom Supabase Client gesendeten Headers zu erlauben.

## Aenderung

**Datei**: `supabase/functions/auto-generate-universal-video/index.ts` (Zeile 33-36)

Von:
```typescript
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
```

Zu:
```typescript
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};
```

## Dateien die geaendert werden

1. **EDIT**: `supabase/functions/auto-generate-universal-video/index.ts` -- corsHeaders aktualisieren

