

## Fix: Text-Overlay-Animationen ruckeln / erscheinen sofort

### Ursache

`displayTime` wird nur alle **250ms** aktualisiert (Zeile 687 in DirectorsCutPreviewPlayer). Die Animation in `NativeTextOverlayRenderer` berechnet `progress = elapsed / 0.5s` — bei 250ms-Updates springt progress von 0 → 0.5 → 1.0 in nur 2 Schritten. Das sieht aus wie "Text erscheint plötzlich".

### Lösung

CSS-Animationen statt JS-berechneter Progress-Werte nutzen. Die Komponente wird gemountet sobald `displayTime >= startTime` — der **Mount-Zeitpunkt** triggert dann eine flüssige 60fps CSS-Animation automatisch.

### Änderung: `NativeTextOverlayRenderer.tsx`

- **fadeIn/scaleUp/bounce**: CSS `@keyframes` + `animation`-Property statt manueller opacity/transform-Berechnung
- **typewriter**: Bleibt JS-basiert (text.substring), aber nutzt `useEffect` + `requestAnimationFrame` für eigenen Timer statt des langsamen `displayTime`
- **highlight**: CSS `@keyframes` für Background-Sweep
- **glitch**: CSS `@keyframes` für Oszillation + text-shadow

Konkret: Die gesamte `switch(overlay.animation)`-Logik (Zeilen 65-128) wird ersetzt durch CSS-Klassen, die beim Mount automatisch abspielen. Für typewriter wird ein interner `useState` + `useEffect` mit eigenem RAF-Timer genutzt.

### Betroffene Datei

- `src/components/directors-cut/preview/NativeTextOverlayRenderer.tsx`

Keine Änderung an `DirectorsCutPreviewPlayer.tsx` nötig.

