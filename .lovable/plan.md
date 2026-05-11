## Ziel

Der Modifier-Tab in `SceneStyleSheet` (über `DirectorPresetPicker` embedded) zeigt aktuell nur Text-Reihen. Jede der 5 Kategorien (Kamera, Objektiv, Licht, Color Grade, Film-Stock) bekommt eine **eigene gelockte Basis-Szene**, aus der alle Varianten dieser Kategorie via Nano Banana 2 (Gemini 3.1 Flash Image Preview) abgeleitet werden — analog zur "Comparable Studio Preset Thumbnail Rule" (Stage 13) für Shot Director.

## 1. Fünf Basis-Szenen generieren — `imagegen` premium

Eine Master-Szene pro Kategorie, gespeichert unter `src/assets/studio-presets/modifier-bases/`. Generierung mit `imagegen--generate_image` Modell `premium` (Nano Banana 2 / GPT-Image kombiniert) für maximale Foto-Qualität:

| Kategorie | Basis-Szene |
|---|---|
| `camera` (7 Optionen) | Person geht in moderner Stadtstraße bei Tageslicht, Mid-Shot — neutraler Look, damit Kamerabewegungen klar werden |
| `lens` (5 Optionen) | Porträt einer Person in Café, halbnah, mittlere Schärfentiefe — neutraler Brennweiten-Look |
| `lighting` (7 Optionen) | Porträt eines Subjekts in einem Raum mit Fenster — neutrales Tageslicht als Ausgangspunkt |
| `mood` / Color Grade (5 Optionen) | Stadtszene blaue Stunde mit Person — neutrales Color Grade |
| `film-stock` (5 Optionen) | Straßen-Porträt mit reichen Texturen (Haut, Stoff, Beton) — clean digital als Ausgangspunkt |

## 2. 29 Varianten-Thumbnails via Nano Banana 2 (Edit)

Pro Preset-ID wird die jeweilige Basis-Szene mit `imagegen--edit_image` (Nano Banana 2 = `google/gemini-3.1-flash-image-preview`, das offizielle Edit-Modell) geremixt. Identity/Geometrie/Komposition bleiben gelockt, nur die Bild-Eigenschaft der jeweiligen Achse ändert sich (z. B. `cam-orbit` → "orbital tracking shot, 360° around subject"; `light-noir` → "high-contrast film noir lighting, hard shadows"; `stock-vhs` → "VHS retro tape look, scanlines, color bleed").

Ablage: `src/assets/studio-presets/modifier/{category}/{presetId}.jpg`.

Aufschlüsselung: 7 (camera) + 5 (lens) + 7 (lighting) + 5 (mood) + 5 (film-stock) = **29 Variant-Bilder + 5 Basis-Bilder = 34 Assets**, alle 1:1 Square (512×512), Prompts strikt englisch (Core-Regel).

**Qualitäts-Fallback**: Falls eine Edit-Variante visuell nicht klar genug differenziert (z. B. `light-volumetric` ohne sichtbare God Rays), wird derselbe Edit-Call mit verstärktem Prompt + `model: 'premium'` einmal wiederholt — gleiche Eskalations-Strategie wie Stage 15 (Dutch-Tilt-Regeneration).

## 3. Neuer Thumbnail-Mapper

`src/config/modifierThumbnails.ts`:
```ts
export function getModifierThumbnail(
  category: PresetCategory,
  presetId: string,
): string | undefined
```
Statisches Mapping `presetId → importierte JPG-URL` (ES6-Imports für Vite-Bundling).

## 4. UI-Umbau `DirectorPresetPicker` (embedded mode)

In `src/components/motion-studio/DirectorPresetPicker.tsx` (Zeilen 77–134) wird die Text-Liste pro Tab durch einen **2-Spalten Thumbnail-Grid** ersetzt — gleicher Look wie `PresetGrid` (Shot Director):
- `aspect-square` Tile mit Thumbnail
- Gradient-Overlay (`from-black/85`) + Label unten
- Active-State: Primary-Border + Checkmark oben rechts
- Hover: Border-Glow + leichter Scale
- Tooltip via `title={preset.description}`
- "Alle Modifier zurücksetzen" Button bleibt unten

Der Popover-Mode (nicht embedded) bleibt unverändert.

## 5. Layout-Polish im SceneStyleSheet

`SceneStyleSheet.tsx` Zeile 288 (`<TabsContent value="modifiers">`): das Inner-Tabs-Layout mit `max-h-[360px] overflow-y-auto` wird auf `overflow-visible` gesetzt, damit nur der äußere Dialog-Scroll greift (gleiche Anti-Doppel-Scrollbar-Regel wie Stage 15 für Shot Director).

## Geänderte/Neue Dateien

- **NEU**: `src/assets/studio-presets/modifier-bases/{camera,lens,lighting,colorgrade,filmstock}.jpg` (5)
- **NEU**: `src/assets/studio-presets/modifier/{camera,lens,lighting,mood,film-stock}/*.jpg` (29)
- **NEU**: `src/config/modifierThumbnails.ts`
- **EDIT**: `src/components/motion-studio/DirectorPresetPicker.tsx` (embedded-Block 77–134)
- **EDIT**: `src/components/video-composer/SceneStyleSheet.tsx` (Zeile 288, overflow)

## Was NICHT angefasst wird

- `directorPresets.ts` (IDs/Modifier-Strings unverändert)
- Popover-Mode des Pickers
- `applyDirectorModifiers` / Prompt-Komposition
- State, API, Memory (Stage-13-Regel deckt es ab)

## Memory-Update

`comparable-thumbnail-rule` wird um "+ Modifier 5 Achsen (cam/lens/lighting/mood/film-stock) via Nano Banana 2" ergänzt — keine neue Datei.

## Aufwand

~34 Image-Generationen (5 Basis premium + 29 Edits Nano Banana 2 parallel pro Kategorie), 1 neue Config-Datei (~40 LoC), 1 Komponenten-Edit (~50 LoC ersetzt durch Grid-Render), 1 1-Zeilen-Patch im SceneStyleSheet.
