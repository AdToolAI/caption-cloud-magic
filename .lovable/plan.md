

## KI-Trendradar Next Level: Echte Artikel & Medien-Integration

### Zusammenfassung

Aktuell generiert die `search-trend-articles` Edge Function **fake Artikel per KI**, die dann auf Google-Suchen verlinken. Das ist wenig wertvoll. Der Upgrade bringt:

1. **Echte Artikel mit Thumbnails** via Perplexity-Connector (echte Web-Suche mit echten URLs)
2. **Neuer "Medien" Tab** mit eingebetteten YouTube-Videos zum Trend
3. **Visuell reichere Artikel-Karten** mit Favicons, Quellen-Labels und Lesezeit-Schaetzungen

### Aenderungen

**1. Perplexity Connector einrichten**
- Perplexity-Connector verbinden (liefert echte Web-Suche mit zitierten URLs)
- Wird fuer echte Artikel-Recherche in der Edge Function genutzt

**2. Edge Function `search-trend-articles/index.ts` komplett ueberarbeiten**
- Perplexity API statt Lovable AI Gateway fuer echte Artikel-Suche nutzen
- Rueckgabe erweitern: `title`, `url`, `description`, `source` (Domain), `thumbnail_url`, `published_date`
- Zusaetzlich: YouTube-Suche via YouTube oEmbed/Data API fuer relevante Videos
- Rueckgabe-Format: `{ articles: [...], videos: [...] }`
- Videos enthalten: `title`, `youtube_id`, `thumbnail_url`, `channel_name`, `views`

**3. Neuer Tab "Medien" im `TrendDetailModal.tsx`**
- Vierter Tab neben Uebersicht/KI-Analyse/Artikel
- Zeigt eingebettete YouTube-Videos zum Trend (iframes)
- Video-Karten mit Thumbnail, Titel, Channel, Views
- Click-to-play inline oder in neuem Tab

**4. Artikel-Tab visuell aufwerten (`TrendDetailModal.tsx`)**
- Artikel-Karten mit Favicon der Quelle (via `https://www.google.com/s2/favicons?domain=...`)
- Quellen-Label (z.B. "socialmediatoday.com")
- Thumbnail-Bild wenn verfuegbar
- Lesezeit-Schaetzung
- Echte Links statt Google-Suche

**5. Trend-Cards auf Hauptseite anreichern**
- Kleines Medien-Icon/Badge wenn Videos/Artikel verfuegbar sind
- "Artikel & Videos" Button neben Analyse-Button

### Technische Aenderungen

| Datei | Aenderung |
|---|---|
| Perplexity Connector | Verbinden via `standard_connectors--connect` |
| `supabase/functions/search-trend-articles/index.ts` | Perplexity API fuer echte Artikel + YouTube Search fuer Videos |
| `src/components/trends/TrendDetailModal.tsx` | Neuer "Medien" Tab mit YouTube-Embeds, Artikel-Tab mit Thumbnails/Favicons |
| `src/pages/TrendRadar.tsx` | defaultTab um 'media' erweitern, Medien-Badge auf Trend-Cards |

### Nicht angefasst
- `fetch-trends` Edge Function (Trend-Generierung bleibt gleich)
- `analyze-trend` Edge Function (KI-Analyse bleibt gleich)
- Bestehende Bookmark-Logik

