

## Plan: Mindestens 5 Artikel pro Kategorie + 5-6h Refresh-Intervall

### Problem
- `BATCH_SIZE = 14` bei 7 Kategorien = nur ~2 Artikel pro Kategorie
- `CACHE_TTL_HOURS = 4` — Refresh alle 4 Stunden statt 5-6

### Lösung

**1. Edge Function `fetch-news-hub/index.ts`**
- `BATCH_SIZE` von 14 auf **40** erhöhen (≥5 pro Kategorie × 7 = 35, plus Puffer für Duplikate/Filter)
- `CACHE_TTL_HOURS` von 4 auf **5** ändern
- Prompt anpassen: explizit anweisen, dass **mindestens 5 Artikel pro Kategorie** zurückgegeben werden sollen und alle 7 Kategorien abgedeckt sein müssen
- `max_tokens` von 5000 auf **12000** erhöhen, damit der größere Output passt
- `search_recency_filter` bleibt `"week"` — so kommen nur Artikel wenn es wirklich neue gibt

**2. Timeout in `supabase/config.toml`**
- Erhöhe auf **180s** (40 Artikel + Pexels-Bilder brauchen mehr Zeit)

### Betroffene Dateien
| Datei | Änderung |
|-------|----------|
| `supabase/functions/fetch-news-hub/index.ts` | BATCH_SIZE=40, CACHE_TTL=5, Prompt + max_tokens |
| `supabase/config.toml` | Timeout auf 180s |

