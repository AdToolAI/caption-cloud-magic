

## Plan: News Radar Klick → News Hub mit Artikel-Highlight

### Was sich ändert

**1. `src/components/dashboard/NewsTicker.tsx`**
- Den `onClick`-Handler jedes News-Items ändern: statt zu `/trend-radar` zu navigieren, wird zu `/news-hub?headline=<encodedHeadline>` navigiert
- Die Headline wird URL-encoded als Query-Parameter übergeben, damit der News Hub den richtigen Artikel finden kann
- Der "NEWS RADAR"-Badge-Klick navigiert ebenfalls zu `/news-hub` (ohne spezifischen Artikel)

**2. `src/pages/NewsHub.tsx`**
- Beim Laden die URL-Query-Parameter auslesen (`headline`)
- Wenn ein `headline`-Parameter vorhanden ist:
  - Den passenden Artikel in der Liste suchen (Substring-Match)
  - Zum Artikel scrollen (`scrollIntoView`)
  - Den Artikel visuell hervorheben (z.B. leuchtender Border, kurze Puls-Animation)
- Jede Artikel-Card bekommt eine `id` basierend auf der Artikel-ID (`article-{id}`), damit gezielt gescrollt werden kann
- Falls der Artikel nicht in den aktuell geladenen Artikeln ist, automatisch weitere laden

### Betroffene Dateien
- `src/components/dashboard/NewsTicker.tsx` — Navigation ändern
- `src/pages/NewsHub.tsx` — Query-Parameter lesen, Scroll + Highlight

### Was sich nicht ändert
- Keine DB-Änderungen
- News Radar Datenquelle bleibt gleich
- News Hub Funktionalität bleibt vollständig erhalten

