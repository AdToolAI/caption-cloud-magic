
## Befund
Aktuell hat Motion Studio im Tab **"Voiceover & Untertitel"** einen Bereich **"Text-Overlays pro Szene"** — d.h. Text wird **pro Szene** konfiguriert und nur über genau diese eine Szene gelegt. Das ist:
- **umständlich** (8 Szenen = 8 Mini-Editoren)
- **starr** (Overlay startet/endet immer mit Szene, kein freies Timing)
- **arm an Features** (nur Position + Animation + Farbe + Größe)

Im **Director's Cut** existiert bereits ein professioneller Editor `TextOverlayEditor2028.tsx` mit:
- **freier Timeline** (Drag-Handles für Start/Ende, Multi-Track, Playhead-Visualisierung)
- **6 Animationen** mit Live-Preview (FadeIn, ScaleUp, Bounce, Typewriter, Highlight, Glitch)
- **9 Positionen** über Position-Grid mit Live-Hover-Preview
- **6 Templates** (CTA, Hashtag, Watermark, Titel, Impact, Countdown)
- **Style-System**: Schriftgröße (S/M/L/XL), Schatten, Hintergrund, Schriftart, 10 Preset-Farben
- **Custom-Position** via x/y-Koordinaten

## Plan

### 1. Datenmodell wechseln (`src/types/video-composer.ts`)
- `ComposerScene.textOverlay` (single per scene) → **deprecated** (für Rückwärtskompatibilität noch lesen, beim nächsten Save migrieren)
- Neuer Top-Level-State auf `LocalProject`: `globalTextOverlays: TextOverlay[]` (gleicher Typ wie Director's Cut)
- Migrations-Helper: bei Laden einer Draft mit per-scene Overlays → in globale Overlays mit `startTime = sceneStartOffset` und `endTime = sceneStartOffset + sceneDuration` umwandeln

### 2. UI-Umbau in `VoiceSubtitlesTab.tsx`
- Kompletten Block **"Text-Overlays pro Szene"** (Zeilen 683–855) entfernen
- Stattdessen: `<TextOverlayEditor2028>` einbinden, der bereits die ganze Mächtigkeit liefert
- Die `videoDuration` = Summe aller Szenen-Dauern; `currentTime` kommt vom Preview-Player

### 3. Preview-Integration (`ComposerSequencePreview.tsx`)
- Per-Scene-Overlay-Logik (Zeilen 185–226) entfernen
- Stattdessen: **`globalTextOverlays`** als Prop akzeptieren und während Wiedergabe nur jene rendern, deren `[startTime, endTime]`-Range den aktuellen `globalTime` enthält
- Renderer-Komponente: `TextOverlayRenderer.tsx` aus `src/remotion/components/` als reine HTML/CSS-Variante adaptieren (Animationen via React-State + CSS, da Preview kein Remotion ist)

### 4. Editor-Player-Sync
- `TextOverlayEditor2028` braucht `currentTime` + `videoDuration` → vom Dashboard hochgereicht, vom Preview-Player gesetzt
- Klick auf Overlay-Track im Editor scrubt den Preview-Player auf Overlay-Start (optional)

### 5. Backend-Render anpassen (`supabase/functions/compose-video-assemble/index.ts`)
- `inputProps.textOverlays`: neues Feld mit der globalen Overlay-Liste (id, text, animation, position, startTime, endTime, style)
- Per-Scene `s.text_overlay`-Mapping fallweise weiter unterstützen, aber wenn `globalTextOverlays` vorhanden → diese benutzen
- Remotion-Template `ComposerVideo.tsx` (oder Pendant) nutzt bereits `TextOverlayRenderer` aus Director's Cut → ggf. Sequence-Wrapper mit `from={startTime*fps}` und `durationInFrames={(endTime-startTime)*fps}` ergänzen

### 6. DB-Persistenz
- Neues Feld `global_text_overlays jsonb` auf `video_composer_projects` (Migration)
- `useComposerPersistence` lädt/speichert `globalTextOverlays`
- Per-Scene `text_overlay` bleibt im Schema (Soft-Deprecation), wird aber nicht mehr beschrieben

### 7. Lokalisierung
- Neue/angepasste Keys in `src/lib/translations.ts` (DE/EN/ES) für: "Text-Overlays" (statt "pro Szene"), Tooltip-Hinweis, Editor-Labels falls nötig

## Geänderte Dateien
- `src/types/video-composer.ts` — globale Overlay-Liste hinzufügen
- `src/components/video-composer/VoiceSubtitlesTab.tsx` — Per-Scene-Block entfernen, Director's-Cut-Editor einbauen
- `src/components/video-composer/ComposerSequencePreview.tsx` — globale Overlays rendern statt per-scene
- `src/components/video-composer/VideoComposerDashboard.tsx` — `globalTextOverlays`-State + Migration
- `src/hooks/useComposerPersistence.ts` — Speichern/Laden des neuen Feldes
- `supabase/functions/compose-video-assemble/index.ts` — neuer Render-Payload
- `src/remotion/compositions/ComposerVideo.tsx` (falls vorhanden) — `<Sequence>`-basiertes Rendering der globalen Overlays
- DB-Migration: `global_text_overlays jsonb` auf `video_composer_projects`
- `src/lib/translations.ts` — DE/EN/ES-Keys

## Verify
- Tab "Voiceover & Untertitel": **kein** "Text-Overlays pro Szene"-Block mehr
- Stattdessen: einheitlicher Director's-Cut-Style-Editor mit Timeline, Templates, Position-Grid, Animations-Preview
- Preview-Player oben zeigt Overlays exakt zur konfigurierten Zeit, unabhängig von Szenen-Grenzen
- Overlay kann z.B. von Sek 3 bis Sek 12 laufen, auch wenn dazwischen 2 Szenen-Cuts sind
- Bestehende Drafts mit Per-Scene-Overlays werden beim Öffnen automatisch migriert → keine Datenverluste
- Final-Render im Tab "Export" enthält die Overlays an den richtigen Zeitpunkten mit der richtigen Animation
