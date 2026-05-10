## Problem

`/sfx-library` zeigt sofort beim Öffnen den Toast „Suche fehlgeschlagen — Failed to send a request to the Edge Function".

## Ursache

Der Hook ruft beim Mount automatisch `supabase.functions.invoke("search-sfx-library", …)` auf — aber die Edge Function ist **nicht deployt**. Sie existiert nur als Quellcode in `supabase/functions/search-sfx-library/index.ts`. Der Aufruf antwortet mit `404 NOT_FOUND`, was die Supabase-JS-SDK als „Failed to send a request to the Edge Function" rendert.

(Gleiche Klasse von Bug wie eben bei `search-stock-videos` — Code existiert, Deploy fehlt.)

## Fix (1 Schritt)

1. **`search-sfx-library` deployen** (`supabase--deploy_edge_functions`).
2. Curl-Smoke-Test: `POST /search-sfx-library` mit `{ "query": "whoosh", "limit": 5 }` → erwartet `200` mit Treffer-Array.
3. SFX-Library-Seite neu laden — Toast verschwindet, Treffer erscheinen.

Kein Code-Change, keine Migration.

Sag Bescheid, wenn ich den Fix ausführen soll.