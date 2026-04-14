

## Plan: Trend Radar komplett überarbeiten — KI-generiert, lokalisiert, dynamisch

### Probleme

1. **Immer auf Englisch**: `TrendRadar.tsx` sendet hardcoded `language: 'en'` statt der UI-Sprache
2. **Immer gleiche Inhalte**: Die Edge Function nutzt ~100 statische, hardcodierte Trends — keine KI-Generierung, kein Refresh
3. **Unprofessionelle Bilder**: Pexels-Suche mit vagen Descriptions liefert generische Stockfotos

### Lösung

**1. Edge Function `fetch-trends/index.ts` — kompletter Umbau**
- Den gesamten hardcodierten `generateDynamicTrends()`-Block (1700+ Zeilen) durch Perplexity-API-Generierung ersetzen — analog zum News Hub
- **Cache-Logik**: Prüfe in `trend_entries` ob für die angefragte Sprache Trends existieren die jünger als 5 Stunden sind. Wenn ja → aus DB laden. Wenn nein → neue via Perplexity generieren
- **Lokalisierte Prompts**: DE/EN/ES-spezifische Prompts, die aktuelle Trends in der jeweiligen Sprache und mit regionalen Quellen generieren
- **Pro Kategorie mindestens 5 Trends** (social-media, ecommerce, lifestyle, business, finance, motivation) = ~35 Trends pro Batch
- **Bessere Pexels-Bilder**: Zusätzliches Feld `image_keywords` im KI-Output, das visuell optimierte Suchbegriffe für Pexels enthält (z.B. "satin curling rods hair woman" statt "overnight satin curling rods no heat damage")
- Hardcoded Trends als reine Fallback-Daten behalten (stark gekürzt auf ~10), nur wenn API fehlschlägt
- `search_recency_filter: "week"` für aktuelle Trends

**2. Frontend `TrendRadar.tsx`**
- `language: 'en'` → `language` aus `useTranslation()` verwenden
- Refresh-Button soll `force: true` senden können, um Cache zu umgehen

**3. Datenbereinigung**
- Bestehende statische `trend_entries` per Migration löschen
- Beim nächsten Laden werden frische, lokalisierte Trends generiert

### Betroffene Dateien

| Datei | Änderung |
|-------|----------|
| `supabase/functions/fetch-trends/index.ts` | Komplett-Umbau: Perplexity-Generierung, Cache, lokalisierte Prompts, image_keywords |
| `src/pages/TrendRadar.tsx` | `language` aus Translation-Hook, force-refresh |
| Migration | DELETE FROM trend_entries |

### Ergebnis
- Deutsche UI → deutsche Trends mit aktuellen Themen
- Trends ändern sich alle 5 Stunden automatisch
- Professionelle, kontextbezogene Bilder durch KI-optimierte Suchbegriffe
- Gleiches Qualitätsniveau wie der News Hub

