

## Lösung: Canvas-basierte Übergänge statt zweitem Video-Decoder

### Das eigentliche Problem
Aktuell nutzt der Preview Player **zwei `<video>`-Elemente** für Übergänge. Das Incoming-Video muss per `video.currentTime = X` an die richtige Stelle seekn — aber das ist im Browser **nicht framegenau**. Der Decoder braucht 50-200ms, um den nächsten Keyframe zu finden. Bei Slide/Push/Wipe sieht man das sofort als "Versatz".

### Die Lösung: Vorgerenderte Frames statt zweitem Decoder
Statt eines zweiten Video-Decoders verwenden wir **voraufgenommene Canvas-Frames** für die eingehende Szene:

1. Beim Laden des Videos wird für jede Szene (ab Szene 2) der **erste Frame als Canvas-Snapshot** in hoher Auflösung (1280×720) erfasst
2. Während einer Transition wird dieser Snapshot als `<canvas>`-Element angezeigt — kein Seeking, kein Decoder-Delay
3. Das Base-Video läuft einfach normal weiter
4. **Ergebnis: Alle Übergangstypen funktionieren perfekt**, weil der Incoming-Frame immer sofort verfügbar ist

```text
Vorher:
  Base <video> ──────────────► [playing scene 1]
  Incoming <video> ──seek──► [trying to decode scene 2 start] ← UNRELIABLE
  
Nachher:
  Base <video> ──────────────► [playing scene 1]
  Canvas snapshot ─────────► [pre-captured frame of scene 2] ← INSTANT
```

### Warum das funktioniert
- Canvas-Snapshots sind **statische Bilder** — kein Decoder, kein Seeking, kein Timing-Problem
- Für kurze Übergänge (0.8-1.5s) ist ein statisches Bild visuell nicht von einem laufenden Video zu unterscheiden
- `NativeTransitionOverlay.tsx` hat diese Logik **bereits implementiert** (wird in Schritt 2 genutzt), aber nur mit 640×360 und als Hintergrund-Bild statt Canvas
- Wir portieren das in den Hauptplayer mit höherer Auflösung und direkter DOM-Manipulation (zero re-renders)

### Änderungen

#### 1) Neuer Hook: `useFrameCapture`
Erfasst beim Laden den ersten Frame jeder Szene als `ImageBitmap` (1280×720). Verwendet ein verstecktes `<video>`-Element mit sequentiellem Seeking. Gibt ein `Map<sceneId, ImageBitmap>` zurück.

#### 2) `useTransitionRenderer` umbauen
Statt das `incomingVideoRef` (ein zweites `<video>`) zu animieren, rendert der Hook den voraufgenommenen Frame auf ein `<canvas>`-Element:
- Canvas ersetzt das zweite `<video>`-Element
- `ctx.drawImage(imageBitmap, ...)` ist eine einzige GPU-Operation — kein Decoder nötig
- Alle CSS-Animationen (opacity, transform, clipPath) funktionieren identisch auf dem Canvas
- Der `readyState`-Fallback wird überflüssig — der Frame ist immer bereit

#### 3) `DirectorsCutPreviewPlayer` vereinfachen
- Zweites `<video>`-Element durch `<canvas>` ersetzen
- Komplette Incoming-Video-Sync-Logik entfernen (Zeilen 356-373, 377-387)
- Pre-Sync-Logik entfällt komplett
- rAF-Loop wird deutlich einfacher — nur noch Base-Video sync

#### 4) Kein zweites `<video>` mehr
Das eliminiert:
- Decoder-Sync-Probleme
- readyState-Checks
- Pre-Buffering-Logik
- Fallback auf Crossfade

### Dateien
- **Neu:** `src/components/directors-cut/preview/useFrameCapture.ts`
- **Umbau:** `src/components/directors-cut/preview/useTransitionRenderer.ts`
- **Vereinfachung:** `src/components/directors-cut/DirectorsCutPreviewPlayer.tsx`

### Ergebnis
- **Alle Übergangstypen** (Slide, Push, Wipe, Crossfade, etc.) funktionieren sauber
- Kein Versatz, kein Stottern, kein "zu früh"
- Einfacherer Code (weniger Logik = weniger Bugs)
- Einziger Trade-off: Incoming-Frame ist ein Standbild statt laufendes Video — bei 0.8-1.5s Übergangsdauer visuell nicht wahrnehmbar

