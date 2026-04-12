

## Plan: Localize KI Picture Studio (EN/DE/ES)

### Problem
The KI Picture Studio module (generate tab + Smart Background tab) has ~200 hardcoded German strings visible in the English UI across 9 files.

### Files to edit (10 files)

| File | German strings (~count) |
|------|------------------------|
| `src/lib/translations.ts` | Add ~150 `picStudio.*` keys (EN/DE/ES) |
| `src/pages/PictureStudio.tsx` | ~5 — "Generieren", "KI Picture Studio", "Erstellen", breadcrumbs |
| `src/components/picture-studio/PictureStudioHeader.tsx` | ~3 — "KI Picture Studio", "Text-to-Image · Smart Background · Alben" |
| `src/components/picture-studio/ImageGenerator.tsx` | ~25 — STYLES labels (Realistisch, Aquarell, Ölgemälde...), ASPECT_RATIOS labels (Quadrat, Vertikal...), "Seitenverhältnis", "Qualität", "Schnell", "Bild generieren", "Bild hochladen", placeholder, toasts, "Generierte Bilder", "Zur Mediathek — Alben" |
| `src/components/picture-studio/SaveToAlbumDialog.tsx` | ~6 — "In Album speichern", "Noch keine Alben vorhanden", "Neues Album erstellen", toasts |
| `src/components/picture-studio/StudioLightbox.tsx` | ~3 — "In Album", "Löschen", "Download" |
| `src/pages/BackgroundReplacer.tsx` | ~40 — CATEGORIES labels, scene pool names, "Produktbild hochladen", "Kategorie", "Anzahl Varianten", "Szenen-Diversität maximieren", "Lichtpräferenz", "Varianten generieren", "Vorschau-Galerie", "Übernommene Variante", "Alle Varianten", "Freistellungs-Qualität", "KI-Hintergrund-Ersteller v3", toasts |
| `src/components/background/SceneGallery.tsx` | ~6 — "Übernehmen", "Qualität", "Schatten", "Farbe" |
| `src/components/background/ExportControls.tsx` | ~8 — "Post planen", toasts ("Bitte wählen Sie...", "Bundle wird erstellt...", "Szenen an Post-Generator übergeben") |
| `src/components/background/ImageLightbox.tsx` | ~8 — "Vorher", "Nachher", "Übernehmen", "Szene", "Kamera", "Qualität", "Schatten", "Farbe" |
| `src/components/background/ProductInsightBanner.tsx` | ~8 — categoryLabels, "KI-Produkterkennung", "Erkannt:", "Kategorie", "Licht", "Intensität", "Übernommen", "Empfehlung übernehmen" |
| `src/components/background/BackgroundReplacerHeroHeader.tsx` | ~3 — "7 Kategorien", "KI-Analyse" |

### Approach
1. Add `picStudio.*` namespace to `translations.ts` with all keys. DE values = exact current hardcoded strings.
2. Add `useTranslation` hook to all 9 component files, replace strings with `t()`.
3. Wrap static arrays (STYLES, ASPECT_RATIOS, CATEGORIES, scene pools, categoryLabels) in `useMemo` for language reactivity.
4. German UI remains identical — no visual changes for DE users.
5. Scene pool names (e.g. "Wald Holzbrücke") will be translated to English equivalents for the EN UI.

### Single batch
All files edited together in one pass.

