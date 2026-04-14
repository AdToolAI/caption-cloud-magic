

## Plan: News Hub auf das nächste Level — Bilder, Videos, Suchleiste

### Was sich ändert

**1. DB-Migration: `news_hub_articles` erweitern**
- Neue Spalten: `image_url TEXT`, `video_url TEXT`, `video_embed_url TEXT`
- Diese werden von der Edge Function beim Fetch befüllt

**2. Edge Function `fetch-news-hub` erweitern**
- Perplexity-Prompt anpassen: zusätzlich `image_url` und `video_url` pro Artikel anfordern (Perplexity liefert oft Bild-URLs aus den Quellen mit)
- Fallback: wenn kein Bild geliefert wird, bleibt `image_url` null — die Card zeigt dann kein Bild (kein Platzhalter)
- JSON-Schema um die neuen Felder erweitern

**3. `useNewsHub.ts` — Suchfunktion hinzufügen**
- Neues State `searchQuery` + `setSearchQuery`
- Suche nutzt Supabase `ilike` auf `headline` und `summary` Felder
- Suchbegriff wird mit Kategorie-Filter kombiniert
- Debounced (300ms) um DB nicht zu überlasten
- Interface `NewsArticle` um `image_url`, `video_url`, `video_embed_url` erweitern

**4. `NewsHub.tsx` — Komplett-Redesign der Seite**

| Feature | Details |
|---------|---------|
| **Suchleiste** | Prominente Suchbar im Header mit Such-Icon, Eingabefeld, Clear-Button. Sucht in Echtzeit über Headlines und Summaries |
| **Artikelbilder** | Wenn `image_url` vorhanden: Bild oben in der Card als Cover (aspect-ratio 16:9, object-cover). Graceful fallback bei Ladefehlern |
| **Video-Einbettung** | Wenn `video_url` vorhanden: Play-Button-Overlay auf dem Bild. Klick öffnet Video in einem Modal/Dialog (eingebetteter Player oder externer Link) |
| **Verbesserte Cards** | Größere Cards mit Bild-Header, reichhaltigerer Darstellung, hover-Effekte |
| **Hero-Header** | Suchleiste integriert neben dem Aktualisieren-Button |

### Betroffene Dateien

| Aktion | Datei |
|--------|-------|
| Migration | `news_hub_articles` + `image_url`, `video_url`, `video_embed_url` |
| Edit | `supabase/functions/fetch-news-hub/index.ts` — Prompt + Felder erweitern |
| Edit | `src/hooks/useNewsHub.ts` — Suchlogik + neue Felder |
| Edit | `src/pages/NewsHub.tsx` — Suchleiste, Bilder, Video-Modal |

### Was sich nicht ändert
- Kategorie-Filter, Paginierung, Deep-Linking vom Ticker — alles bleibt
- News Radar Ticker unverändert
- Keine neuen API-Keys nötig (Perplexity liefert Bild-URLs aus Suchergebnissen)

