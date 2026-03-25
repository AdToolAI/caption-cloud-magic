

## KI Picture Studio — Konzept

Das bestehende "Smart Background" wird zu einem vollwertigen **KI Picture Studio** transformiert — einem zentralen Ort fuer KI-Bildgenerierung, Smart Backgrounds und Album-Verwaltung.

### Architektur

```text
/picture-studio (Route, ersetzt /background-replacer)
  ├── Tab 1: KI Bildgenerator (Text-to-Image + Image-to-Image)
  ├── Tab 2: Smart Background (bestehende Funktionalitaet)
  └── Tab 3: Meine Alben (Galerie + Album-Management)
```

### Aenderungen

#### 1. Neue Seite `src/pages/PictureStudio.tsx`

Container-Seite mit drei Tabs (Framer Motion Tab-Wechsel):
- **Generieren**: Freie KI-Bildgenerierung
- **Smart Background**: Bestehender BackgroundReplacer (als eingebettete Komponente)
- **Alben**: Album-Galerie mit Ordnerstruktur

Hero-Header im James Bond 2028 Stil mit "KI Picture Studio" Branding, animierten Partikeln und Glassmorphismus.

#### 2. Neue Komponente `src/components/picture-studio/ImageGenerator.tsx`

Der Kern des neuen Features:
- **Text-to-Image**: Prompt-Eingabe mit Style-Selector (20+ Styles aus dem bestehenden Visual-Style-System: realistic, cinematic, watercolor, neon-cyberpunk, anime etc.)
- **Image-to-Image**: Bild hochladen + Bearbeitungs-Prompt (z.B. "Mache den Himmel dramatischer")
- **Seitenverhaeltnis-Wahl**: 1:1, 16:9, 9:16, 4:5
- **Qualitaets-Stufe**: Schnell (Nano Banana) vs. Pro (Nano Banana Pro)
- Generierte Bilder erscheinen in einer Masonry-Galerie mit Glassmorphismus-Cards
- Jedes Bild hat: Download, In Album speichern, Variationen erstellen, Als Referenz fuer Smart Background nutzen

Nutzt bestehende Edge Function Patterns + Lovable AI Gateway (`google/gemini-3.1-flash-image-preview` / `google/gemini-3-pro-image-preview`).

#### 3. Neue Edge Function `supabase/functions/generate-studio-image/index.ts`

- Text-to-Image: Prompt + Style-Modifiers → Lovable AI Gateway (Image-Modality)
- Image-to-Image: Upload + Edit-Prompt → Lovable AI Gateway (Edit-Image)
- Bild wird in `background-projects` Bucket hochgeladen
- Metadaten (Prompt, Style, Qualitaet) werden in neuer DB-Tabelle gespeichert
- Rate Limit + Credit Guard wie bei Smart Background

#### 4. Datenbank: Neue Tabellen

**`studio_albums`**:
- id, user_id, name, description, cover_image_url, created_at, updated_at
- RLS: Nur eigene Alben sichtbar

**`studio_images`**:
- id, user_id, album_id (nullable FK), image_url, thumbnail_url, prompt, style, model_used, aspect_ratio, source ('generated' | 'background' | 'upload'), metadata_json, created_at
- RLS: Nur eigene Bilder sichtbar

#### 5. Neue Komponente `src/components/picture-studio/AlbumManager.tsx`

- Album-Grid mit Cover-Vorschau (erstes Bild oder manuell gewaehlt)
- Album erstellen/umbenennen/loeschen
- Drag-and-Drop Bilder in Alben verschieben
- Album-Detailansicht: Masonry-Galerie der Bilder
- "Unsortiert" als Standard-Sammlung fuer Bilder ohne Album
- Lightbox bei Klick (bestehende ImageLightbox wiederverwenden)

#### 6. Neue Komponente `src/components/picture-studio/PictureStudioHeader.tsx`

- Glassmorphismus Hero mit animierten Partikeln
- "KI Picture Studio" Titel mit Gradient
- Badge "v1" mit Glow
- Untertitel: "Text-to-Image · Smart Background · Alben"
- Stats-Leiste: Generierte Bilder | Alben | Credits

#### 7. `src/pages/BackgroundReplacer.tsx` → Refaktor

- Bestehende Logik bleibt, wird aber als `SmartBackgroundTab` Komponente extrahiert
- Import-Pfad von MediaLibrary wird auf `/picture-studio` umgeleitet
- Route `/background-replacer` redirected zu `/picture-studio?tab=background`

#### 8. Integration in bestehende Navigation

- Route `/background-replacer` → Redirect zu `/picture-studio`
- Hub-Navigation: "Smart Background" wird zu "KI Picture Studio"
- MediaLibrary "Send to Smart Background" → "Send to Picture Studio"

#### 9. Smart Background ↔ Generator Verbindung

- Generierte Bilder koennen direkt als Hintergrund im Smart Background Tab verwendet werden
- Smart Background Ergebnisse werden automatisch in Studio-Galerie gespeichert
- "Variationen erstellen" Button auf jedem Bild → oeffnet Generator mit Referenzbild

### Dateien (Uebersicht)

1. `src/pages/PictureStudio.tsx` — Neue Container-Seite mit Tabs
2. `src/components/picture-studio/PictureStudioHeader.tsx` — Hero Header
3. `src/components/picture-studio/ImageGenerator.tsx` — Text/Image-to-Image Generator
4. `src/components/picture-studio/AlbumManager.tsx` — Album-Verwaltung + Galerie
5. `src/components/picture-studio/AlbumDetailView.tsx` — Einzelnes Album mit Bildern
6. `src/components/picture-studio/ImageCard.tsx` — Wiederverwendbare Bild-Karte mit Actions
7. `supabase/functions/generate-studio-image/index.ts` — Neue Edge Function
8. `src/pages/BackgroundReplacer.tsx` → Refaktor zu einbettbarer Komponente
9. `src/App.tsx` — Neue Route `/picture-studio`, Redirect `/background-replacer`
10. `src/pages/MediaLibrary.tsx` — Links auf Picture Studio umstellen
11. DB Migration: `studio_albums` + `studio_images` Tabellen + RLS

