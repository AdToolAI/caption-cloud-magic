

## Befund
Aktuell zeigt der Text-Tab nur eine kleine fake "Untertitel-Preview-Box" und pro Szene ein Mini-Thumbnail. Es fehlt ein zusammenhängender Preview-Player, der das gesamte Video (alle Clips hintereinander) zeigt — so kann man Text-Overlays und Untertitel nicht im Gesamtkontext beurteilen.

Vorhandene Daten: jede `scene.clipUrl` ist bereits gerendert (Status `ready`), inkl. `durationSeconds`. Kein Render nötig — wir spielen die Clips clientseitig sequenziell ab.

## Plan — Sequenzieller Multi-Clip-Preview oben im Text-Tab

### 1. Neue Komponente `ComposerSequencePreview.tsx`
Im Ordner `src/components/video-composer/`. Funktion:
- Nimmt `scenes` (mit `clipUrl` + `durationSeconds`) + `subtitles` + per-scene `textOverlay`
- **Dual-`<video>`-Slot-Architektur** (Ping-Pong) für nahtlose Übergänge: während Slot A spielt, lädt Slot B den nächsten Clip → kein Black-Frame
- Für Bild-Szenen (`uploadType === 'image'`): zeigt das Bild für die definierte Dauer
- Eigene Timeline-Logik: `currentSceneIndex` + `localTime` → kombiniert zu globaler Zeit
- Controls: Play/Pause, Scrubber (gesamte Sequenz), aktuelle Zeit / Gesamtdauer, Mute
- **Live-Overlay-Rendering** über dem Video:
  - Aktiver Szenen-Text-Overlay (mit Position/Animation aus `scene.textOverlay`)
  - Globale Untertitel-Zeile (Demo-Text aus aktiver Szene wenn `subtitles.enabled`) mit Schriftart, Größe, Farbe, Hintergrund, Position aus `subtitles.style`
- Szenen-Indikator (kleine Punkte unten: "Szene 3 / 8")

### 2. Integration in `TextSubtitlesTab.tsx`
- Ganz oben (über "Automatische Untertitel"-Sektion) Card mit `<ComposerSequencePreview>` einfügen
- Nur anzeigen wenn `scenes.some(s => s.clipUrl)` — sonst Hinweis "Generiere zuerst Clips im Clips-Tab"
- Die existierende kleine Mini-Preview-Box (Zeile 234-250) bleibt zusätzlich als isolierte Untertitel-Style-Vorschau

### 3. Reaktivität
- Komponente erhält Props (scenes, subtitles, overlays-per-scene) und re-rendert Overlays sofort bei Änderungen → User sieht direkt im großen Preview, wie sich Schriftart/Position/Farbe auswirken
- Keine DB- oder Render-Calls — rein clientseitig

### 4. Edge-Cases
- Fehlt `clipUrl` einer Szene → Black-Slate mit "Szene X — Clip fehlt"
- Beim Scrub springt der Player zur richtigen Szene + Offset
- Bei Pause stoppt sowohl Video als auch interner Timer

## Geänderte / Neue Dateien
**Neu**:
- `src/components/video-composer/ComposerSequencePreview.tsx`

**Bearbeitet**:
- `src/components/video-composer/TextSubtitlesTab.tsx` — Preview-Card oben einfügen
- `src/lib/translations.ts` — neue Keys (`previewFullVideo`, `clipsMissingForPreview`, `sceneOf`) DE/EN/ES

## Verify
- Im Text-Tab erscheint ganz oben ein großer Preview-Player
- Play spielt alle Clips nahtlos hintereinander ab
- Text-Overlays erscheinen szenenabhängig korrekt positioniert
- Untertitel-Style-Änderungen (Schriftart/Farbe/Position) wirken sich live im großen Player aus
- Scrubber springt korrekt zwischen Szenen
- Wenn noch keine Clips bereit: freundlicher Hinweis statt Player

## Was unverändert bleibt
- DB-Schema, Render-Pipeline, Audio/Briefing/Clips/Storyboard-Tabs, Pricing

