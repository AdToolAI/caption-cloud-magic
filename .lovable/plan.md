

## Perplexity API Key speichern & Trendradar Upgrade

Der API Key wird sicher als Backend-Secret gespeichert und die Trendradar-Funktion wird komplett ueberarbeitet.

### Schritt 1: API Key sicher speichern
- Den Perplexity API Key als Secret `PERPLEXITY_API_KEY` im Backend hinterlegen
- Der Key wird **nicht** im Code gespeichert, sondern ist nur fuer Backend-Funktionen verfuegbar

### Schritt 2: Edge Function `search-trend-articles` ueberarbeiten
- Perplexity `sonar` Modell fuer echte Web-Suche mit echten URLs und Quellen nutzen
- Rueckgabe erweitern: `title`, `url`, `description`, `source` (Domain), `published_date`
- YouTube-Video-Suche hinzufuegen (via Lovable AI)
- Neues Rueckgabe-Format: `{ articles: [...], videos: [...] }`

### Schritt 3: Neuer "Medien" Tab im TrendDetailModal
- Vierter Tab neben Uebersicht/KI-Analyse/Artikel
- YouTube-Videos als eingebettete iframes
- Video-Karten mit Thumbnail, Titel, Channel

### Schritt 4: Artikel-Tab visuell aufwerten
- Favicon der Quelle via Google Favicon API
- Quellen-Label (z.B. "socialmediatoday.com")
- Echte Links statt Google-Suche-Redirect

### Schritt 5: Trend-Cards anreichern
- Medien-Badge wenn Videos/Artikel verfuegbar

### Technische Aenderungen

| Datei | Aenderung |
|---|---|
| Secret `PERPLEXITY_API_KEY` | Sicher als Backend-Secret speichern |
| `supabase/functions/search-trend-articles/index.ts` | Perplexity API + YouTube-Suche |
| `src/components/trends/TrendDetailModal.tsx` | Medien-Tab + Artikel-Upgrade |
| `src/pages/TrendRadar.tsx` | Medien-Badge auf Trend-Cards |

