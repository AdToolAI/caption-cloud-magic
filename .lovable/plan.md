

## Plan: News Radar — Stündliche Aktualisierung und mehr Vielfalt

### Probleme
1. **Cache TTL ist 6 Stunden** — News werden viel zu selten aktualisiert. Es gibt nur 1 Cache-Eintrag in der DB.
2. **Perplexity-Prompt ist zu statisch** — Fragt immer nach "den 8-10 wichtigsten News der letzten 7 Tage" mit niedriger Temperatur (0.2). Ergebnis: fast identische Antworten bei jedem Abruf.

### Lösung

**`supabase/functions/fetch-news-radar/index.ts`**
- Cache TTL von 6h auf **1h** reduzieren
- Temperatur von 0.2 auf **0.6** erhöhen für mehr Variation
- `search_recency_filter` von `week` auf `day` ändern — fokussiert auf die letzten 24h statt 7 Tage
- Prompt erweitern: "Gib mir NEWS die sich von diesen unterscheiden: [letzte Headlines]" — die letzten cached Headlines werden als Kontext mitgegeben, damit Perplexity neue Themen liefert
- Zeitstempel in den Prompt einbauen (aktuelle Uhrzeit), damit identische Anfragen nicht identische Antworten liefern

**`src/components/dashboard/NewsTicker.tsx`**
- Refresh-Intervall bleibt bei 1h (passt bereits zum neuen Cache TTL)

### Betroffene Dateien
- `supabase/functions/fetch-news-radar/index.ts` — Cache TTL, Prompt-Optimierung

