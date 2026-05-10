## Problem

Auf `/stock-videos` zeigt die UI immer „Keine Treffer (0)" — obwohl Pexels und Pixabay korrekt Ergebnisse liefern.

## Ursache

Die deployte Version von `search-stock-videos` ist **veraltet**. Sie liefert ein altes Payload-Schema:

```json
{ "videos": [...], "sources": {...}, "total": 15, "cached": true }
```

Der neue Hook `useStockVideoSearch` liest aber `data.results` — das Feld existiert in der alten Antwort nicht, also kommt ein leeres Array an und die UI rendert „0 Treffer".

Der Quellcode in `supabase/functions/search-stock-videos/index.ts` ist bereits korrekt (`payload = { results: merged, providers, ... }`), wurde aber seit dem letzten Edit nicht neu deployt. Die Cache-Tabelle `stock_video_cache` ist leer — der Mismatch kommt also direkt aus der Live-Function.

## Fix (1 Schritt)

1. **`search-stock-videos` neu deployen** (`supabase--deploy_edge_functions`).
2. Anschließend ein Curl-Smoke-Test gegen den Endpoint, um zu bestätigen, dass die Antwort jetzt `results: [...]` enthält.
3. Stock-Videos-Seite im Preview neu laden — Treffer sollten erscheinen.

Kein Code-Change nötig, keine Migration, kein Cache-Flush (Cache ist leer).

## Optional als Folge-Härtung (nicht in diesem Fix)

Damit so ein Schema-Mismatch nicht wieder durch alte Cache-Einträge maskiert wird:
- Cache-Key mit Versionsprefix versehen (`v2:` vor dem JSON-Hash), damit alte Payloads automatisch ignoriert werden.

Sag Bescheid, wenn ich den Fix ausführen soll.