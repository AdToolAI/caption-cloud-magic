
# Block I — Stock Media Library + Platform Export Presets

Letzter großer Schritt zu Artlist-/CapCut-Niveau. Aufgeteilt in **zwei Sub-Blöcke** (I-1 zuerst, I-2 danach), die unabhängig voneinander Mehrwert liefern.

---

## Bestandsaufnahme (verifiziert im Code)

| Asset | Status |
|---|---|
| `supabase/functions/search-stock-videos` (Pixabay + Pexels) | ✅ existiert, wird in `ClipsTab.tsx:437` einmalig per Szene aufgerufen |
| `supabase/functions/search-stock-images` (Pixabay + Pexels) | ✅ existiert, **wird nirgends im Composer aufgerufen** |
| `src/lib/mediaProfilePresets.ts` (Instagram/TikTok/YouTube/X/FB/LinkedIn Presets) | ✅ vollständig fertig, wird vom Composer aktuell **nicht** genutzt |
| `user_audio_library` Tabelle | ✅ aus Block G — Vorlage für `user_media_library` |
| Scene-Picker UI (`SceneCard.tsx:149`) | ⚠ kennt nur `ai-hailuo / ai-kling / ai-image / stock / upload`. „stock" zeigt nur ein Suchfeld → Video, Bilder fehlen ganz |
| `briefing.aspectRatio` (`16:9 / 9:16 / 1:1 / 4:5`) | ✅ existiert, aber kein Re-Frame / Export-Preset darauf gemappt |

**Konsequenz:** Sehr viel UI-Glue, sehr wenig neue Engine-Arbeit.

---

## Sub-Block I-1 — Stock Media Library (P0)

### Ziel
User soll für jede Szene per One-Click auf eine Bibliothek mit Stock-Videos **und** Stock-Bildern zugreifen können — analog zu `MusicLibraryBrowser` aus Block G — inklusive Mood-Quick-Picks, Favoriten und „My Library".

### 1. Datenbank — Migration
Neue Tabelle `user_media_library` (analog zu `user_audio_library`):

```sql
CREATE TABLE public.user_media_library (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type          text NOT NULL CHECK (type IN ('video','image')),
  source        text NOT NULL CHECK (source IN ('pixabay','pexels','upload')),
  external_id   text,
  url           text NOT NULL,
  thumbnail_url text,
  width         int,
  height        int,
  duration_sec  numeric,            -- nur für videos
  tags          text[] DEFAULT '{}',
  category      text,               -- business, nature, lifestyle, tech, …
  author_name   text,
  author_url    text,
  is_favorite   boolean DEFAULT true,
  created_at    timestamptz DEFAULT now()
);

ALTER TABLE public.user_media_library ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own media library"
  ON public.user_media_library FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_user_media_library_user_type
  ON public.user_media_library(user_id, type, created_at DESC);
```

### 2. Neue Komponente `StockMediaBrowser.tsx`
Analog zu `MusicLibraryBrowser.tsx`. Modal/Sheet mit 3 Tabs:

- **Videos** (ruft `search-stock-videos` auf — bereits vorhanden)
- **Bilder** (ruft `search-stock-images` auf — bereits vorhanden, aber bisher ungenutzt)
- **My Library** (liest aus `user_media_library` für den aktuellen User)

**Features:**
- 8 kuratierte **Quick-Pick-Kategorien** (Karten oben): Business, Nature, Lifestyle, Tech, City, Food, Sport, Abstract → setzt Suchquery + triggert Search
- Suchleiste mit Debounce (500 ms)
- Hover-Preview (Video autoplay muted, Bild Lightbox)
- ⭐ Favorite-Button → INSERT in `user_media_library`
- Quelle/Autor-Credit sichtbar (Pixabay/Pexels-Lizenz-Anforderung)
- Pagination 20 pro Seite, Infinite-Scroll
- Aspect-Filter (Hochformat/Querformat/Quadrat) basierend auf `briefing.aspectRatio`

### 3. Integration in Scene-Picker (`SceneCard.tsx`)
- `ClipSource` Type erweitern: ergänze `'stock-image'` (existierend: `'stock'` = Video)
  ```ts
  export type ClipSource = 'ai-hailuo' | 'ai-kling' | 'ai-sora' | 'ai-image'
                         | 'stock' | 'stock-image' | 'upload';
  ```
- Source-Picker-Buttons (Zeile 149) um „Stock Bild" erweitern
- Bei Auswahl von `stock` ODER `stock-image` öffnet sich `StockMediaBrowser` mit vorgewähltem Tab statt nur einem Suchfeld
- `ComposerScene` ergänzen:
  - `stockMediaUrl?: string` (gewählte URL)
  - `stockMediaThumb?: string`
  - `stockMediaSource?: 'pixabay' | 'pexels'`
  - `stockMediaAuthor?: { name; url }` (für Credit-Overlay im Export)
- Ersetze die Inline-Pixabay-Suche in `ClipsTab.tsx:432-451` durch `StockMediaBrowser`

### 4. AI-Auto-Pick (Bonus, klein)
In `auto-generate-storyboard` Edge Function (falls vorhanden): wenn User in Briefing „No-AI / Stock-only" wählt, automatisch pro Szene einen Stock-Suchstring generieren und ersten Pixabay-Treffer vorbelegen → Composer ohne AI-Kosten möglich.

### 5. Lokalisierung (EN/DE/ES)
Neue Keys:
- `videoComposer.stock.tabs.videos / images / library`
- `videoComposer.stock.categories.business / nature / lifestyle / tech / city / food / sport / abstract`
- `videoComposer.stock.favorite / saved / browseLibrary / creditAttribution`

### Geänderte/neue Dateien (I-1)
- **Neu:** `src/components/video-composer/StockMediaBrowser.tsx`
- **Neu:** Migration `user_media_library` Tabelle
- **Modifiziert:** `src/types/video-composer.ts` — `ClipSource` + `ComposerScene` Felder
- **Modifiziert:** `src/components/video-composer/SceneCard.tsx` — neuer Quick-Action Button + Browser-Trigger
- **Modifiziert:** `src/components/video-composer/ClipsTab.tsx` — Inline-Suche durch Browser ersetzen
- **Modifiziert:** EN/DE/ES Locale-Dateien

---

## Sub-Block I-2 — Plattform Export-Presets (P1)

### Ziel
One-Click-Export pro Plattform mit korrektem Aspect/Auflösung/Bitrate und automatischem Re-Framing (Smart-Crop), basierend auf den **bereits existierenden** `mediaProfilePresets.ts`.

### 1. Neue Komponente `ExportPresetPanel.tsx`
Erscheint im `AssemblyTab` nach erfolgreichem Render (oder als „Export auch in …" CTA):

- Grid aus 6 Plattform-Karten: **TikTok / Instagram Feed / Instagram Reel / YouTube Short / YouTube Standard / LinkedIn**
- Jede Karte zeigt: Aspect, Ziel-Auflösung, geschätzte Dateigröße
- Multi-Select (z. B. „TikTok + Reel + Short" rendern)
- Pro ausgewähltes Preset: Single-Click → ruft `render-composer-export-preset` Edge Function

### 2. Neue Edge Function `render-composer-export-preset`
Wrapper um die bestehende Render-Pipeline:
- Input: `projectId`, `presetKey` (z. B. `tiktok.video-9-16`)
- Lädt Preset aus `mediaProfilePresets.ts` (Quelle ins Edge-Function-Verzeichnis dupliziert oder via shared `_shared/presets.ts`)
- Triggert neuen Lambda-Render mit überschriebenen Parametern:
  - `width / height` aus Preset
  - `targetBitrateMbps`, `targetFps`, `audioKbps`, `codec` aus Preset
  - `fitMode: 'cover'` → Smart-Crop (siehe 3.)
  - `maxDurationSec` → Hard-Trim falls Composer-Output länger
- Speichert Output in `composer_exports` Tabelle (siehe 4.)

### 3. Smart-Crop Logik
Wenn Composer-Aspect (z. B. 16:9) ≠ Preset-Aspect (z. B. 9:16):
- **Default:** Center-Crop (einfach, deterministisch, lambdasicher)
- **Optional Bonus:** „Subject-Aware Crop" — falls Szene `referenceImageUrl` oder per `gemini-2.5-flash` ein Saliency-Punkt geliefert wurde, Crop um diesen Punkt zentrieren
- Implementierung in Remotion-Komposition als CSS `object-position` + `transform: scale()` — keine teure Lambda-Logik

### 4. Migration: `composer_exports`
```sql
CREATE TABLE public.composer_exports (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   uuid NOT NULL REFERENCES public.composer_projects(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL,
  preset_key   text NOT NULL,           -- e.g. "tiktok.video-9-16"
  platform     text NOT NULL,
  output_url   text,
  thumbnail_url text,
  width        int,
  height       int,
  duration_sec numeric,
  file_size_mb numeric,
  status       text DEFAULT 'pending',  -- pending|rendering|completed|failed
  cost_credits numeric DEFAULT 0,
  created_at   timestamptz DEFAULT now(),
  completed_at timestamptz
);

ALTER TABLE public.composer_exports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own exports"
  ON public.composer_exports FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY "System manages exports"
  ON public.composer_exports FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
```

### 5. Direkt-Publish Hook (Bonus, klein)
Pro Export-Karte: „Direkt zu TikTok/IG posten" Button → nutzt bestehende `unified-social-publishing` Engine. Schließt den Loop: Brief → Render → Plattform-spezifischer Export → Direkt-Publish.

### 6. Credit-Modell
- Re-Render eines Presets = **20 % der Original-Render-Kosten** (nur Encoding, kein neuer AI-Content)
- Mehrere Presets gleichzeitig = lineare Summe
- Vorab im Panel klar angezeigt → konsistent mit `CostEstimationPanel` aus Block B

### 7. Lokalisierung (EN/DE/ES)
Neue Keys:
- `videoComposer.export.title / subtitle / startExport / multiSelect`
- `videoComposer.export.presets.tiktok / instagramFeed / instagramReel / youtubeShort / youtubeStandard / linkedin`
- `videoComposer.export.smartCrop / centerCrop / autoTrim / costNotice`

### Geänderte/neue Dateien (I-2)
- **Neu:** `src/components/video-composer/ExportPresetPanel.tsx`
- **Neu:** `supabase/functions/render-composer-export-preset/index.ts`
- **Neu:** `supabase/functions/_shared/mediaProfilePresets.ts` (Spiegel des frontend-File)
- **Neu:** Migration `composer_exports` Tabelle
- **Modifiziert:** `src/components/video-composer/AssemblyTab.tsx` — ExportPresetPanel nach erfolgreichem Render einblenden
- **Modifiziert:** Remotion-Komposition für Smart-Crop (CSS `object-position`)
- **Modifiziert:** EN/DE/ES Locale-Dateien

---

## Bewusst NICHT im Scope
- ❌ Echtes ML-basiertes Subject-Detection (das wäre Block I+)
- ❌ Eigener Stock-Footage-Upload-Marketplace (User-generated stock)
- ❌ Dynamic Aspect Re-Animation (z. B. Ken-Burns auf 9:16 neu pannen) — heuristischer Center-Crop reicht für 95 % der Fälle
- ❌ Watermark-Removal von Pixabay-Credits (Lizenz erlaubt es; für saubere Optik trotzdem Credit-Overlay-Toggle)

---

## Aufwand & Reihenfolge
| Block | Aufwand | Wert |
|---|---|---|
| **I-1 (Stock Library)** | ~1 Tag | Schließt die letzte echte Artlist-Lücke |
| **I-2 (Export-Presets)** | ~1 Tag | Reine UI-Glue, da Presets schon existieren |

**Empfehlung:** I-1 zuerst (sofort sichtbarer Mehrwert in der Scene-Picker-UI), dann I-2.

Nach Abschluss kann das Studio sauber als „Artlist-Niveau" positioniert werden — komplette Pipeline von Briefing → AI-Generierung **oder** Stock-Auswahl → Brand-Anwendung → Render → Plattform-spezifischer Export → Direkt-Publish.

Soll ich beide Sub-Blöcke nacheinander umsetzen (I-1 zuerst), oder nur einen davon?
