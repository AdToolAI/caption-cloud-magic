## Phase 6.3 — Premium Video Stock Tier

Ein neuer **Stock Video Hub** unter `/stock-videos` mit kuratierten 4K/HDR/Cinematic-Clips aus kostenlosen Quellen (Pexels Video, Pixabay Video, Coverr, Mixkit). Kein Paywall — der "Premium"-Charakter entsteht ausschließlich durch **Qualitätsfilter**, **Kuration** und **Editorial Collections**.

### Was der Nutzer bekommt

- Eigene Seite `/stock-videos` mit:
  - **Live-Suche** in Pexels + Pixabay Videos (Coverr/Mixkit als kuratierter Katalog)
  - **Quality-Badges**: 4K · HDR-look · Vertical · Cinematic · Slow-Motion
  - **Editorial Collections**: "Cinematic Drone", "Luxury Lifestyle", "Tech & AI", "Nature Macro", "Urban Night", "Product Hero" (jeweils 12–20 handverlesene Clips)
  - **Filter**: Auflösung (HD/4K), Orientation (16:9/9:16/1:1), Dauer (<10s/10–30s/>30s), Farb-Mood (warm/cool/mono), FPS (30/60)
  - **Hover-Preview** (autoplay muted), Favoriten, **License-Button** (Phase 6.2 Integration), Download
  - **"In Composer/Director's Cut verwenden"** via existierendes sessionStorage-Pattern
- Integration in **AI Video Composer** und **Director's Cut** als zusätzlicher Tab "Stock Video" neben dem bestehenden Stock-Picker

### Technische Umsetzung

**1. Edge Function `search-stock-videos`** (neu)
- Aggregiert Pexels Video + Pixabay Video API parallel
- Normalisiert Response: `{ id, provider, preview_url, video_files: [{quality, width, height, fps, url}], thumbnail, duration, orientation, tags, photographer, source_url }`
- Quality-Score: clip bekommt `is_4k`, `is_hd`, `is_vertical`, `is_slowmo` Flags basierend auf Metadata
- Cache in `stock_video_cache` Tabelle (24h TTL, key = `provider:query:filters_hash`)
- Fallback-Katalog (Mixkit/Coverr-URLs hardcoded JSON) falls API-Keys fehlen
- Pexels-Key (`PEXELS_API_KEY`) bereits vorhanden? → fetch_secrets prüfen, sonst add_secret
- Pixabay-Key (`PIXABAY_API_KEY`) ebenso

**2. DB-Migration**
- `stock_video_cache` (query_hash UNIQUE, payload JSONB, expires_at)
- Erweitert `user_audio_library` → besser separate `user_video_library` Tabelle für Stock-Video-Favoriten (asset_id, provider, metadata, asset_type='stock_video')
- RLS: user_id = auth.uid()

**3. Editorial Collections**
- Statisches JSON `src/config/stockVideoCollections.ts` mit 6 Collections × ~15 kuratierten Pexels/Pixabay Video-IDs
- Collections rendern als Hero-Karten oben auf `/stock-videos`

**4. UI** (neue Datei `src/pages/StockVideos.tsx`)
- Bond-Design (deep black, gold accents, glassmorphism)
- Layout: Hero mit Suchfeld → Editorial Collections Carousel → Filter-Bar → Video-Grid (3-spaltig)
- `<StockVideoCard>` Component: Thumb mit Hover-Preview, Quality-Badges, Action-Bar (Favorit, Lizenz, Download, "Use in…")
- "Use in Composer" / "Use in Director's Cut" Buttons → sessionStorage (`composer:incoming-stock-video`, `directors-cut:incoming-stock-video`)

**5. Receivers**
- `VideoComposer`: liest sessionStorage beim Mount und fügt Clip als neue Scene hinzu (engine = `stock`)
- `UniversalDirectorsCut`: liest sessionStorage und appended als Video-Clip auf Track 1
- Composer hat bereits "Stock Library" Tab → diese Phase fügt **Video-Modus** dazu (bisher nur B-Roll/Reference Bilder + Pexels)

**6. License-Integration**
- Jede StockVideoCard zeigt `<LicenseButton>` mit `source_provider="pexels"` oder `"pixabay"` (beide bereits in `_shared/license-mapping.ts` gemappt)
- Beim "Use in Composer" wird automatisch ein Lizenz-Zertifikat ausgestellt (idempotent, Phase-6.2-Hook)

**7. Hub-Integration**
- `src/config/hubConfig.ts`: neue Karte "Stock Videos" in Sektion "Erstellen", neben SFX Library
- Sidebar-Eintrag

### Was NICHT in 6.3

- Echte Paid-APIs (Storyblocks, Artgrid, Envato) — separater späterer Schritt mit Vertrag
- Plan-basiertes Gating
- AI-Upscaling von Stock auf 4K
- Music/SFX Premium Tier (Scope ist explizit nur Video)

### Files (neu)

```
supabase/functions/search-stock-videos/index.ts
supabase/migrations/<timestamp>_stock_video_cache.sql
src/pages/StockVideos.tsx
src/components/stock-videos/StockVideoCard.tsx
src/components/stock-videos/EditorialCollections.tsx
src/components/stock-videos/StockVideoFilters.tsx
src/config/stockVideoCollections.ts
src/hooks/useStockVideoSearch.ts
```

### Files (edit)

```
src/App.tsx                  (route /stock-videos)
src/config/hubConfig.ts      (Hub-Karte)
src/pages/VideoComposer.tsx  (sessionStorage receiver + Tab)
src/pages/UniversalDirectorsCut.tsx  (sessionStorage receiver)
```

### Secrets

Prüfung der bereits konfigurierten `PEXELS_API_KEY` / `PIXABAY_API_KEY` zu Beginn. Falls nicht vorhanden → add_secret-Flow. Beide APIs sind kostenlos mit hohem Limit (Pexels 200/h, Pixabay 100/min).
