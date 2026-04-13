

## Plan: Präzisere Pexels-Bildsuche für Trends

### Problem
Die Suchbegriffe für Pexels sind ungenau. Ein Trend namens `#MiniSuccessStories` wird zu `"MiniSuccessStories"` — ein zusammengeschriebenes Wort, das Pexels nicht versteht. Ebenso liefert `"Heatless Curling Rod Set"` ein generisches Ergebnis statt eines Bildes von Lockenwicklern.

### Lösung
Zwei Verbesserungen in `searchPexelsImage` und `enrichTrendsWithImages`:

1. **Bessere Query-Aufbereitung**: CamelCase und Hashtags intelligent in Wörter aufteilen (`#MiniSuccessStories` → `"Mini Success Stories"`), kurze Stoppwörter entfernen
2. **Description als Suchbegriff nutzen**: Statt nur `trend.name` wird primär die `trend.description` verwendet (z.B. "Overnight satin curling rods — no heat damage" → viel bessere Pexels-Treffer), mit `trend.name` als Fallback
3. **Mehr Ergebnisse anfordern**: `per_page=5` statt `per_page=1`, dann das relevanteste Bild auswählen (größte Auflösung)
4. **Curated Image Map**: Für die häufigsten/wichtigsten Trend-Kategorien eine manuelle Zuordnung von Pexels-Foto-IDs, die garantiert perfekt passen

### Änderungen

**`supabase/functions/fetch-trends/index.ts`**

- `splitCamelCase(str)` Hilfsfunktion: `"MiniSuccessStories"` → `"Mini Success Stories"`
- `buildSearchQuery(trend)`: Nutzt `trend.description` (erste 5-6 Wörter, bereinigt) als primären Suchbegriff, Fallback auf aufgeteilten `trend.name`
- `searchPexelsImage`: `per_page=5`, wählt Foto mit höchster Auflösung
- `enrichTrendsWithImages`: Übergibt ganzes Trend-Objekt statt nur Name

### Betroffene Dateien
- `supabase/functions/fetch-trends/index.ts` — Query-Logik verbessern

### Ergebnis
- `#MiniSuccessStories` → sucht "authentic success stories progress" (aus Description) → Bild von Person am Laptop
- `Heatless Curling Rod Set` → sucht "satin curling rods heat damage" → Bild von Haarpflege-Produkten
- Deutlich relevantere Bilder ohne zusätzliche API-Kosten

