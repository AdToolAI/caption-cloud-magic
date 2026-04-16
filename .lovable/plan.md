

## Plan: "Video Composer" → "Motion Studio" umbenennen

### Änderungen

1. **Translations (src/lib/translations.ts)** — 3 Sprachen:
   - EN: `videoComposer.title` → "Motion Studio", `hubItemDesc.videoComposer` → "Scene-based video assembly with AI clips, stock & uploads"
   - DE: `videoComposer.title` → "Motion Studio", Beschreibung anpassen
   - ES: `videoComposer.title` → "Motion Studio", Beschreibung anpassen

2. **Hub Config (src/config/hubConfig.ts)**:
   - Route `/video-composer` bleibt gleich (URL-Stabilität)
   - `titleKey` bleibt `videoComposer.title` (wird über Translation aufgelöst)

3. **Page Title (src/pages/VideoComposer/index.tsx)**:
   - Helmet title → "Motion Studio | AdTool"
   - Meta description anpassen

4. **Dashboard Header (src/components/video-composer/VideoComposerDashboard.tsx)**:
   - Sicherstellen, dass der Titel aus der Translation kommt (nicht hardcoded)

5. **Memory Update (mem://features/video-composer/architecture)**:
   - "AI Video Composer" → "Motion Studio" im Memory-File

Dateistruktur und Komponentennamen (VideoComposer, video-composer/) bleiben intern unverändert — nur der User-facing Name ändert sich.

