

## Plan: Feintuning der Pexels-Bildsuche (80% → 100% Trefferquote)

### Problem
~20% der Suchbegriffe sind zu abstrakt oder abgeschnitten, z.B.:
- "Produce posts one day for maximum" → kein visuelles Subjekt
- "Tell personal stories seconds" → zu vage
- "Focused work without distractions for maximum" → generisch

Diese Queries beschreiben *Strategien*, nicht *Objekte*. Pexels braucht konkrete, visuelle Begriffe.

### Lösung

Drei gezielte Verbesserungen in `buildSearchQuery`:

1. **Kategorie-spezifische Suchstrategie**: Für `social-media` und `motivation`-Trends (die meist Strategien/Konzepte beschreiben) wird der Trend-Name bevorzugt + ein visuelles Keyword aus einer Kategorie-Map angehängt (z.B. "Content Batching" + "laptop workspace" → "content batching laptop workspace")

2. **Stoppwort-Filter erweitern**: Wörter wie "for", "with", "without", "maximum", "your", "the", "and" werden aus dem Query entfernt, damit nur inhaltlich relevante Begriffe übrig bleiben

3. **Minimum-Wort-Qualitätsprüfung**: Wenn nach dem Filtern weniger als 3 Wörter übrig sind, wird der Trend-Name (splitCamelCase) + Kategorie-Keyword als Fallback verwendet

### Änderungen

**`supabase/functions/fetch-trends/index.ts`**

- `buildSearchQuery` anpassen:
  - Erweiterte Stoppwort-Liste: `for, with, without, your, the, and, that, this, how, can, from, into, than, most, one, day, days, per, via, maximum, minimum`
  - Neue Map `categoryVisualKeywords`: `social-media → "smartphone laptop content"`, `motivation → "person success sunrise"`, `lifestyle → "wellness healthy living"`, etc.
  - Für abstrakte Kategorien (social-media, motivation, business): Trend-Name + visuelles Keyword bevorzugen
  - Für konkrete Kategorien (ecommerce, lifestyle, finance): Description-basierte Suche beibehalten (funktioniert bereits gut)

### Betroffene Dateien
- `supabase/functions/fetch-trends/index.ts` — nur `buildSearchQuery` Funktion (~30 Zeilen)

### Ergebnis
- "Content Batching" → "content batching laptop workspace" statt "Produce posts one day for maximum"
- "Storytime Format" → "storytime storytelling camera" statt "Tell personal stories seconds"
- Produkt-Trends bleiben unverändert (funktionieren bereits gut)

