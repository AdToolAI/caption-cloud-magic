# Stage 15 — Dialog-Polish + Asset-Korrekturen

## Was du gemeldet hast

1. **Dialog zu klein** — soll fast Vollbild sein
2. **Zwei Scrollbars** im "Stil ändern → Feintuning" Dialog
3. **"Kran aufwärts" und "Kran abwärts" Bilder vertauscht** (Labels stimmen, Bilder zeigen das Gegenteil)
4. **"Schräglage" (Dutch Tilt)** zeigt Frontal-Ansicht statt seitlich gekippter Kamera

## Fix (3 Dateien + 1 Bild-Regenerierung)

### 1. Dialog auf Near-Fullscreen (`SceneStyleSheet.tsx`, Zeile 199)
```diff
- <DialogContent className="max-w-4xl max-h-[88vh] p-0 gap-0 overflow-hidden flex flex-col">
+ <DialogContent className="max-w-[95vw] w-[95vw] h-[92vh] max-h-[92vh] p-0 gap-0 overflow-hidden flex flex-col">
```

### 2. Doppel-Scroll entfernen (`SceneShotDirectorPanel.tsx`)
- **Zeile 183** (Master-Achsen-Liste): `max-h-[400px] overflow-y-auto` → `overflow-visible` (scrollt mit dem Dialog mit)
- **Zeile 214** (Detail-Spalte mit `<PresetGrid>`): `max-h-[400px] overflow-y-auto` → `overflow-visible`

Dadurch übernimmt nur noch der äußere Dialog-Scroll-Container das Scrollen → eine einzige Scrollbar.

### 3. Crane Up / Crane Down vertauscht
**Einfachster Fix:** Mapping in `studioPresetThumbnails.ts` (Z. 143–144) tauschen:
```diff
- 'crane-up':   movementCraneUp,
- 'crane-down': movementCraneDown,
+ 'crane-up':   movementCraneDown,  // Datei zeigt eigentlich Aufwärts-Bewegung
+ 'crane-down': movementCraneUp,    // Datei zeigt eigentlich Abwärts-Bewegung
```
(Schneller & sicherer als Datei-Rename, keine anderen Stellen ändern.)

### 4. Schräglage-Bild neu generieren
`src/assets/studio-presets/angle/dutch-tilt.jpg` neu via `imagegen` mit explizit seitlich/diagonal gekippter Kamera (gleiche Tokio-Szene als locked base):
> "Same Tokyo Shibuya street scene with woman in trench coat, but camera tilted ~20° on its roll axis (Dutch tilt / canted angle) — horizon line clearly diagonal, not horizontal. Cinematic, photorealistic."

Comparable-Thumbnail-Regel bleibt gewahrt (gleiche Base-Szene wie die anderen Angle-Tiles).

## Verifikation

- `/video-composer` → Szene → "Stil ändern" → Dialog füllt fast den ganzen Bildschirm
- Nur **eine** Scrollbar (rechts vom Dialog), kein interner Mini-Scroller mehr
- "Bewegung" → "Kran aufwärts" zeigt jetzt Aufwärts-Schwenk, "Kran abwärts" Abwärts-Schwenk
- "Winkel" → "Schräglage" zeigt diagonalen Horizont (gekippte Kamera)

## Was NICHT geändert wird

- Dialog-Inhalt, Tabs (Looks/Feintuning/Modifier), `PresetGrid`, Master-Detail-Logik
- Andere Bilder (10 Movement, 8 Angle, 12 Cinematic, etc.)
- Keine API-/State-/Memory-Änderung

## Aufwand

3 Code-Edits (~5 Zeilen netto) + 1 Bild-Regenerierung. ~2 Min.
