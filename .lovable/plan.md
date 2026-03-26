

## Fix: Stotterer + doppelte Übergänge beseitigen

### Ursache

Das Overlay für eingehende Szenen (Zeile 880-903) erzeugt ein **zweites `<Video>`-Element** mit eigenem Decoder (`startFrom={nextSceneStartFrame}`). Genau das war das ursprüngliche Problem — jeder neue Video-Decoder verursacht einen Stotterer. Zusätzlich sieht man "beide Übergänge", weil das Basisvideo weiterläuft während gleichzeitig das Overlay-Video einblendet.

### Lösung: Nur EIN Video, Übergänge rein visuell

Das zweite `<Video>` komplett entfernen. Alle Übergänge werden ausschließlich als CSS-Effekte auf dem einzigen Video-Element umgesetzt:

- **Crossfade/Dissolve**: Kurzer Opacity-Dip (1 → 0.2 → 1) — simuliert Überblendung
- **Fade**: Stärkerer Dip zu Schwarz (1 → 0 → 1) via schwarzem Overlay
- **Wipe**: `clip-path` Animation auf dem Video selbst — Bild wird von einer Seite "aufgedeckt"
- **Slide/Push**: `transform: translate` auf dem Video — Bild gleitet raus
- **Zoom**: `scale()` Vergrößerung als visueller Akzent
- **Blur**: `filter: blur()` Weichzeichner

Das ist keine perfekte 1:1-Darstellung des finalen Renders, aber es ist **flüssig und ohne Stotterer** — was in der Preview wichtiger ist.

### Änderungen

**`src/remotion/templates/DirectorsCutVideo.tsx`**
- Zeilen 762-838: `incomingOverlay*`-Variablen und zugehörige Logik entfernen
- Zeilen 879-903: Das zweite `<Video>`-Element im Overlay komplett entfernen
- Transition-Effekte nur noch auf dem Basisvideo via `opacity`, `filter`, `transform`, `clipPath`
- Crossfade/Dissolve: stärkerer Opacity-Dip + schwarzer Overlay-Blitz
- Wipe: `clipPath` direkt auf dem Video (zeigt "Aufdecken" der nächsten Szene)

### Was sich nicht ändert
- Finaler Render mit TransitionSeries + per-Scene Video bleibt unverändert
- Audio-Architektur bleibt unverändert
- Szenenkonzept, Editing, Filter bleiben erhalten

### Erwartetes Ergebnis
- 0 Stotterer (nur 1 Video-Decoder aktiv)
- Übergänge als klare visuelle Effekte sichtbar (kein "doppelter" Übergang mehr)
- Preview ist eine Approximation des finalen Looks, nicht 1:1 identisch

