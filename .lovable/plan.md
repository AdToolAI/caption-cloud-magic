## Problem

Auf der Storyboard-Seite (Schritt 2) wächst der Inhalt seitlich über den Viewport hinaus, sodass die Seite horizontal scrollt. Ursache: die innere Content-Spalte einer Szene-Karte (`<div className="flex-1 space-y-3">` in `SceneCard.tsx`) hat **kein `min-w-0`**. Dadurch ignoriert der Browser das `overflow-x-auto` des „Cinematic Looks"-Rails (12 Preset-Karten à ~140 px ≈ 1680 px) und vergrößert stattdessen den Flex-Container — die ganze Szene-Karte und damit die ganze Seite werden breiter als der `max-w-7xl`-Container.

Zusätzlich sind einige Sub-Elemente unnötig breit/sperrig.

## Lösung

Layout reparieren + Inhalte etwas dichter packen, ohne Funktionalität zu entfernen.

### 1) Overflow-Fix (Hauptursache)
- `src/components/video-composer/SceneCard.tsx` Zeile 288: `flex-1 space-y-3` → `flex-1 min-w-0 space-y-3`
- Defensiv ebenfalls: dem äußeren Karten-Wrapper / `CardContent` ein `overflow-hidden` geben, damit eine versehentliche Breite nie wieder die Seite sprengen kann.

### 2) „Cinematic Looks"-Rail kompakter
`src/components/ai-video/CinematicStylePresets.tsx`:
- Im `compact`-Modus Karten von `w-[120px]` auf `w-[104px]` verkleinern, Padding `p-2` → `p-1.5`, Emoji `text-xl` → `text-lg`.
- Sicherstellen, dass das Rail einen scrollenden Container mit klarer Begrenzung hat (`max-w-full overflow-x-auto`).

### 3) Shot Director vertikaler statt breiter
`src/components/video-composer/SceneShotDirectorPanel.tsx`:
- Grid bleibt `grid-cols-2`, aber Buttons strikt auf `min-w-0 truncate` setzen, damit lange Optionswerte (z. B. „Slow Push-In") die Spalte nicht aufblasen.

### 4) Director-Mode-Button-Reihe sauberer umbrechen
`SceneCard.tsx` (Director-Mode-Block ~Zeile 370):
- `flex flex-wrap items-center gap-1.5` bleibt, aber Button-Text bei sehr engen Viewports nur als Icon (Label `hidden xl:inline`).

### 5) Storyboard-Container atmen lassen
`src/components/video-composer/StoryboardTab.tsx`:
- `max-w-4xl` bleibt; zusätzlich `min-w-0` auf den inneren Wrapper, damit verschachtelte Flex-Elemente nicht durchschlagen.

### Ergebnis
- Keine horizontale Seiten-Scroll-Leiste mehr.
- Cinematic Looks scrollen sauber **innerhalb** der Szene-Karte.
- Shot Director / Light / Director Mode bleiben vollständig sichtbar, brechen bei Bedarf nach unten um.
- Funktionalität unverändert — nur Layout & Dichte angepasst.

### Geänderte Dateien
- `src/components/video-composer/SceneCard.tsx`
- `src/components/ai-video/CinematicStylePresets.tsx`
- `src/components/video-composer/SceneShotDirectorPanel.tsx`
- `src/components/video-composer/StoryboardTab.tsx`