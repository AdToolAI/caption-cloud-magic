## Hebel 6: Echte Stock-Library-Integration

Wir bauen eine Live-Stock-Suche direkt in Motion Studio (und Video Composer) — auf Pexels + Pixabay — mit Server-Side Caching und „Use as Reference“ / „Use as B-Roll" Aktionen direkt aus dem Such-Modal.

### Was es schon gibt (wiederverwenden, nicht neu bauen)
- `supabase/functions/search-stock-videos` (Pexels + Pixabay parallel) ✓
- `supabase/functions/search-stock-images` ✓
- `src/components/video-composer/StockMediaBrowser.tsx` (Composer-only)
- `SceneSnippetPicker` mit Tabs „Kuratiert / Meine Snippets"

### Was neu kommt

**1. Caching-Layer (Edge + DB)**
- Neue Tabelle `stock_search_cache` (`query`, `media_type`, `provider_mix`, `results_json`, `expires_at`, `hit_count`).
- `search-stock-videos` und `search-stock-images` werden um Cache-Lookup erweitert: bei Treffer mit `expires_at > now()` direkt zurückgeben + `hit_count++`. TTL: 24h.
- Optionaler Query-Param `force_refresh: true` zum Bypass.
- RLS: nur `service_role` write, `authenticated` read.

**2. StockSearchModal (Motion-Studio-tauglich)**
- Neue Komponente `src/components/motion-studio/StockSearchModal.tsx`.
- Tabs: **Videos | Bilder**. Suchfeld + Quick-Chips („cinematic city", „nature drone", „office team"…).
- Result-Grid mit Thumbnail, Source-Badge (Pexels/Pixabay), Dauer, Auflösung.
- Pro Asset zwei primäre Aktionen:
  - **„Use as Reference"** → setzt `reference_image_url` der aktuellen Location oder Charakter-Variante (Frame-Extraction für Videos via `<video>` + canvas, dann Upload in `motion-studio-references` Storage).
  - **„Use as B-Roll"** → fügt eine neue Szene ins Storyboard ein (Typ `b_roll`, mit `clip_url` = Pexels/Pixabay Direct URL, Cast leer, Duration = Asset-Duration capped auf 6 s).
- Footer: Pexels/Pixabay-Attribution-Hinweis (rechtlich Pflicht).

**3. Integration in SceneSnippetPicker**
- Dritter Tab **„Stock Live"** neben „Kuratiert" / „Meine Snippets" → öffnet die neue Suche eingebettet (gleiches Grid, gleiche Aktionen).
- Aus dem StudioMode kann der User damit aus *einer* Library wählen: Curated → Mine → Stock-Live.

**4. Integration in Composer (StockMediaBrowser)**
- Bestehender `StockMediaBrowser` ruft die gleichen (jetzt gecachten) Edge-Funktionen → automatischer Speed-Boost.
- Neue Aktion „Use as Reference" zusätzlich zur bestehenden „Use as Clip".

**5. Frame-Extraction-Helper**
- Neue Utility `src/lib/stock/extractVideoFrame.ts` — lädt das Stock-Video, extrahiert Frame@1s als JPEG-Blob, lädt es in `motion-studio-references/{user_id}/...` hoch, gibt die public URL zurück. Nötig damit „Use as Reference" auf Videos funktioniert (Reference-Pipeline arbeitet mit Bildern).

### Technische Details

**Caching-Edge-Logik (Pseudocode):**
```ts
const cacheKey = `${media_type}:${query.toLowerCase().trim()}`;
const cached = await supabase.from('stock_search_cache')
  .select('*').eq('cache_key', cacheKey)
  .gt('expires_at', new Date().toISOString()).maybeSingle();
if (cached && !force_refresh) {
  await supabase.from('stock_search_cache').update({ hit_count: cached.hit_count + 1 }).eq('id', cached.id);
  return cached.results_json;
}
// otherwise: fetch Pexels+Pixabay, store in cache with TTL 24h
```

**DB-Migration:**
```sql
CREATE TABLE public.stock_search_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cache_key text NOT NULL UNIQUE,
  query text NOT NULL,
  media_type text NOT NULL CHECK (media_type IN ('video','image')),
  results_json jsonb NOT NULL,
  provider_counts jsonb DEFAULT '{}'::jsonb,
  hit_count int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '24 hours'
);
CREATE INDEX ON public.stock_search_cache (expires_at);
ALTER TABLE public.stock_search_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "stock_cache_read" ON public.stock_search_cache FOR SELECT TO authenticated USING (true);
```

**API-Keys:** `PEXELS_API_KEY` und `PIXABAY_API_KEY` werden bereits in den bestehenden Edge-Funktionen erwartet. Falls einer fehlt, läuft die Funktion bereits mit dem anderen Provider weiter (graceful degradation).

### Dateien
- **Neu**: `supabase/migrations/<ts>_stock_search_cache.sql`
- **Neu**: `src/components/motion-studio/StockSearchModal.tsx`
- **Neu**: `src/lib/stock/extractVideoFrame.ts`
- **Geändert**: `supabase/functions/search-stock-videos/index.ts` (Cache-Layer)
- **Geändert**: `supabase/functions/search-stock-images/index.ts` (Cache-Layer)
- **Geändert**: `src/components/motion-studio/SceneSnippetPicker.tsx` (3. Tab „Stock Live")
- **Geändert**: `src/pages/MotionStudio/StudioMode.tsx` (B-Roll-Insertion + Reference-Set Handler)
- **Geändert**: `src/components/video-composer/StockMediaBrowser.tsx` („Use as Reference"-Button)

### Akzeptanzkriterien
- Suche „cinematic city" liefert beim ersten Mal Pexels+Pixabay-Mix in <2s, beim zweiten Mal aus Cache in <300 ms.
- „Use as Reference" auf Pexels-Video → extrahiert Frame, lädt hoch, setzt `reference_image_url` auf der aktuellen Location.
- „Use as B-Roll" → neue Szene erscheint im Storyboard mit Stock-URL als Clip.
- Attribution sichtbar im Modal-Footer.

### Out-of-Scope (bewusst)
- Keine Quality-Scoring-/Curation-Heuristik (klar: kuratierte Snippets bleiben die Premium-Schicht).
- Keine eigene Lizenz-DB (Pexels/Pixabay sind beide royalty-free, Attribution wird angezeigt).
