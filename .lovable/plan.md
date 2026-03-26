

## Fix: Letzte 2 Stotterer beseitigen

### Verbleibende Ursachen

1. **`premountFor={30}` reicht nicht ganz** — 30 Frames = 1 Sekunde Vorlauf. Bei langsamem Netzwerk oder großen Videos kann der Browser den Decoder in 1s nicht fertig vorbereiten. Erhöhung auf **60 Frames (2 Sekunden)** gibt dem Decoder deutlich mehr Zeit.

2. **`setInternalTime` bei jedem Tick** — auch mit 100ms-Throttle löst `setInternalTime(time)` (Zeile 369) bei jedem Update einen React-State-Change aus, der Subtitle-Berechnung und andere UI-Elemente neu rendert. Lösung: `internalTime` als **`useRef`** führen und nur den sichtbaren Slider/Zeitanzeige per `requestAnimationFrame` updaten — kein React-State-Tick während Playback.

3. **Externer Zeit-Sync während Playback** — der `useEffect` auf Zeile 422-431 vergleicht `currentTime` (von Parent) mit `internalTime` und triggert `seekTo` wenn die Differenz > 0.5s ist. Während normalem Playback kann das ungewollte Seeks auslösen. Lösung: Sync nur ausführen wenn **nicht** playing.

### Änderungen

**`src/remotion/templates/DirectorsCutVideo.tsx`**
- `premountFor={30}` → `premountFor={60}` auf allen `TransitionSeries.Sequence`

**`src/components/directors-cut/DirectorsCutPreviewPlayer.tsx`**
- `internalTime` von `useState` zu `useRef` umbauen
- Neuen `displayTime` State einführen, der nur alle ~250ms aktualisiert wird (für Slider/Zeitanzeige)
- Subtitle-Berechnung auf `displayTime` statt `internalTime` basieren
- Externer Zeit-Sync (`seekTo`) nur wenn `!isPlaying`
- Audio-Drift-Korrektur Schwelle von 0.3s auf 0.5s erhöhen (weniger aggressive Korrekturen)

### Erwartetes Ergebnis
- Kein React-Re-Render mehr bei jedem Playback-Tick
- 2 Sekunden Decoder-Vorlauf statt 1
- Keine Seek-Interrupts während laufender Wiedergabe
- Audio läuft weiterhin unabhängig und linear

