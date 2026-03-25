

## Perplexity Integration & Trendradar Upgrade - Implementierung

Alle 5 Schritte des genehmigten Plans muessen noch umgesetzt werden.

### Schritt 1: Perplexity API Key sicher speichern
- Secret `PERPLEXITY_API_KEY` mit dem bereitgestellten Key `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` anlegen

### Schritt 2: Edge Function `search-trend-articles/index.ts` komplett umschreiben
- Perplexity `sonar` Modell fuer echte Web-Suche nutzen
- Zweiten Aufruf via Lovable AI fuer YouTube-Video-Vorschlaege
- Rueckgabe-Format: `{ articles: [...], videos: [...] }`
- Artikel enthalten: `title`, `url`, `description`, `source` (Domain aus URL extrahiert)

### Schritt 3: Medien-Tab in `TrendDetailModal.tsx`
- Vierter Tab "Medien" neben Uebersicht/KI-Analyse/Artikel
- YouTube-Videos als eingebettete iframes
- Video-Karten mit Titel und Channel-Name

### Schritt 4: Artikel-Tab visuell aufwerten
- Favicon via `https://www.google.com/s2/favicons?domain=...`
- Quellen-Domain als Label anzeigen
- Echte URLs statt Google-Suche-Redirects

### Schritt 5: Medien-Badge auf Trend-Cards in `TrendRadar.tsx`
- Kleines Badge-Icon wenn Artikel/Videos verfuegbar

### Technische Aenderungen

| Datei | Aenderung |
|---|---|
| Secret `PERPLEXITY_API_KEY` | Neu anlegen |
| `supabase/functions/search-trend-articles/index.ts` | Komplett umschreiben: Perplexity API + YouTube-Suche |
| `src/components/trends/TrendDetailModal.tsx` | Medien-Tab + Artikel-Upgrade mit Favicons |
| `src/pages/TrendRadar.tsx` | Medien-Badge auf Cards |

