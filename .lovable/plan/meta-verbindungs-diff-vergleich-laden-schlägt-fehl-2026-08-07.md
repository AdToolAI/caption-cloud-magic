# Meta-Verbindungs-Diff: „Vergleich laden" schlägt fehl

## Befund (gemessen, nicht vermutet)

Der Aufruf der Funktion `meta-oauth-diff` endet mit HTTP 503 `BOOT_ERROR`. Das Log nennt die Ursache eindeutig:

```text
worker boot error: Unable to load .../@supabase/supabase-js/2.75.0/cors
imported from meta-oauth-diff/index.ts: path not found
```

Die Funktion importiert in Zeile 8 `corsHeaders` aus `npm:@supabase/supabase-js@2/cors`. Diesen Unterpfad gibt es in der aufgelösten Version 2.75.0 nicht — die Funktion startet deshalb gar nicht erst. Im Browser erscheint das als „Failed to send a request to the Edge Function". Es ist also kein Datenproblem und kein Auth-Problem.

## Fix

- In `supabase/functions/meta-oauth-diff/index.ts` den fehlerhaften Import entfernen und `corsHeaders` lokal definieren (gleiche Header-Liste wie in den übrigen Meta-Funktionen: `Access-Control-Allow-Origin`, `-Methods`, `-Headers`). Die restliche Logik bleibt unverändert.
- Funktion neu deployen.
- Danach `POST /meta-oauth-diff` direkt testen und bestätigen, dass sie 200 statt 503 liefert.

## Zusätzliche Absicherung

Prüfen, ob weitere Funktionen denselben Import verwenden, und diese im selben Schritt mitziehen — sonst tritt derselbe Boot-Fehler an anderer Stelle auf.
