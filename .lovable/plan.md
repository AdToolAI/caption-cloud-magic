

## Plan: TrendRadar — Hardcodierte deutsche Strings lokalisieren

### Problem
`TrendRadar.tsx`, `TrendRadarHeroHeader.tsx` und `TrendDetailModal.tsx` enthalten ~40 hardcodierte deutsche Strings, die auch im englischen/spanischen UI erscheinen.

### Änderungen

**1. `src/lib/translations.ts` — Neue Keys im `trends`-Block (alle 3 Sprachen)**

| Key | EN | DE | ES |
|---|---|---|---|
| `trends.aiTrendRadar` | AI Trend Radar | KI-Trendradar | Radar de Tendencias IA |
| `trends.reload` | Reload | Neu laden | Recargar |
| `trends.trendsAnalyzed` | Trends analyzed | Trends analysiert | Tendencias analizadas |
| `trends.platforms` | Platforms | Plattformen | Plataformas |
| `trends.categories` | Categories | Kategorien | Categorías |
| `trends.topTrendsSubtitleAlt` | The hottest trends at a glance | Die heißesten Trends im Überblick | Las tendencias más calientes |
| `trends.analyzeNow` | Analyze now | Jetzt analysieren | Analizar ahora |
| `trends.ofCount` | of | von | de |
| `trends.learnMore` | Learn more | Mehr erfahren | Saber más |
| `trends.analyze` | Analyze | Analysieren | Analizar |
| `trends.quickFacts` | Quick Facts | Quick-Facts | Datos rápidos |
| `trends.back` | Back | Zurück | Volver |
| `trends.platformLabel` | Platform | Plattform | Plataforma |
| `trends.categoryLabel` | Category | Kategorie | Categoría |
| `trends.general` | General | Allgemein | General |
| `trends.type` | Type | Typ | Tipo |
| `trends.popularityLabel` | Popularity | Popularität | Popularidad |
| `trends.targetAudience` | Target Audience | Zielgruppe | Audiencia objetivo |
| `trends.fullAnalysis` | Full Analysis | Vollständige Analyse | Análisis completo |
| `trends.noSavedTrends` | You haven't saved any trends yet | Du hast noch keine Trends gespeichert | Aún no has guardado tendencias |
| `trends.discoverTrends` | Discover trends | Trends entdecken | Descubrir tendencias |
| `trends.noTrendsFound` | No trends found | Keine Trends gefunden | No se encontraron tendencias |
| `trends.reloadTrends` | Reload trends | Trends neu laden | Recargar tendencias |
| `trends.analysisComplete` | Analysis complete | Analyse abgeschlossen | Análisis completado |
| `trends.ideasGenerated` | content ideas generated | Content-Ideen generiert | ideas de contenido generadas |
| `trends.analysisFailed` | Analysis failed | Analyse fehlgeschlagen | Análisis fallido |
| `trends.error` | Error | Fehler | Error |
| `trends.cannotSave` | This trend cannot be saved | Dieser Trend kann nicht gespeichert werden | Esta tendencia no se puede guardar |
| `trends.bookmarkRemoved` | Bookmark removed | Bookmark entfernt | Marcador eliminado |
| `trends.trendSaved` | Trend saved | Trend gespeichert | Tendencia guardada |
| `trends.unknownError` | Unknown error | Unbekannter Fehler | Error desconocido |
| `trends.loadError` | Could not load trends | Trends konnten nicht geladen werden | No se pudieron cargar las tendencias |
| `trends.ecommerceCategories` | E-Commerce Product Categories | E-Commerce Produkt-Kategorien | Categorías de productos E-Commerce |
| `trends.overview` | Overview | Übersicht | Resumen |
| `trends.contentIdeas` | Content Ideas | Content-Ideen | Ideas de contenido |
| `trends.recommendedHashtags` | Recommended Hashtags | Empfohlene Hashtags | Hashtags recomendados |
| `trends.hashtagStrategy` | Hashtag Strategy | Hashtag-Strategie | Estrategia de hashtags |

Plus E-Commerce Subcategory-Namen lokalisieren.

**2. `src/pages/TrendRadar.tsx` — Alle ~30 hardcoded Strings ersetzen**
- `FloatingStats`: labels durch `t()` ersetzen
- `HeroCarousel`: "Top-Trends der Woche", "Die heißesten...", "von", "Popularität:", "Jetzt analysieren"
- Main component: "Du hast noch keine...", "Trends entdecken", "Keine Trends gefunden", "Trends neu laden", "Mehr erfahren", "Analysieren", "Quick-Facts", "Zurück", "Plattform", "Kategorie", "Allgemein", "Popularität", "Zielgruppe", "Vollständige Analyse", "E-Commerce Produkt-Kategorien"
- Toast-Texte: "Analyse abgeschlossen", "Analyse fehlgeschlagen", "Fehler", "Bookmark entfernt", "Trend gespeichert"
- E-Commerce Subcategories

**3. `src/components/trends/TrendRadarHeroHeader.tsx` — 2 Strings**
- "KI-Trendradar" → `t('trends.aiTrendRadar')`
- "Neu laden" → `t('trends.reload')`

**4. `src/components/trends/TrendDetailModal.tsx` — ~10 Strings**
- "Popularität", "Übersicht", "Content-Ideen", "Empfohlene Hashtags", "Zielgruppe", "Hashtag-Strategie"
- `date-fns/locale` dynamisch nach Sprache wählen (statt immer `de`)

### Betroffene Dateien
- `src/lib/translations.ts`
- `src/pages/TrendRadar.tsx`
- `src/components/trends/TrendRadarHeroHeader.tsx`
- `src/components/trends/TrendDetailModal.tsx`

