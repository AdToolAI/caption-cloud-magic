

## Fix: CORS-bedingte Transition-Ausfälle beheben

### Ursache (jetzt bestätigt durch Logs)

Die Console-Logs zeigen:
- Transition-Daten kommen korrekt an (3 Transitions, richtige Typen)
- Resolver gibt korrekte Ausgabe (3 resolved transitions)
- Renderer startet mit korrekten resolvedTransitions

**ABER**: Die CORS-Fehler blockieren die Frame-Capture-Videos komplett. `useFrameCapture.ts` und `NativeTransitionOverlay.tsx` erstellen Video-Elemente mit `crossOrigin = 'anonymous'`, aber der S3-Bucket gibt keine `Access-Control-Allow-Origin`-Header zurück. Dadurch werden **keine Frames gecaptured** → der Canvas hat keine Bitmaps → alle Transitions sind unsichtbar, egal welcher Typ gesetzt ist.

### Lösung: Dual-Video CSS-Transitions statt Canvas-Compositing

Statt das CORS-Problem auf S3-Seite zu lösen (was wir hier nicht können), wechseln wir auf einen Ansatz, der **kein Canvas-Frame-Capture braucht**:

**1. Zweites `<video>`-Element im Preview-Player hinzufügen** (`DirectorsCutPreviewPlayer.tsx`)
- Ein zweites `<video>` (ohne `crossOrigin`) für die eingehende Szene
- Beide Videos ohne `crossOrigin` → kein CORS nötig
- Das zweite Video wird vor Transition-Beginn auf den Start der nächsten Szene geseekt

**2. CSS-basierte Transitions statt Canvas** (`useTransitionRenderer.ts`)
- Statt `drawTransitionComposite()` auf Canvas: direkte DOM-Manipulation der zwei Video-Elemente
- Nutzt die bereits existierende Logik aus `NativeTransitionLayer.tsx` (`getTransitionStyles()`)
- Crossfade → opacity auf beiden Videos
- Slide/Push → transform auf dem incoming Video
- Wipe → clipPath auf dem incoming Video
- Fade → opacity-Sequenz (out → black → in)
- Blur → CSS filter blur + opacity

**3. Canvas nur als Fallback behalten**
- Wenn aus irgendeinem Grund das zweite Video nicht bereit ist, wird der aktuelle Canvas-Ansatz als Fallback versucht
- Canvas-Display bleibt `none` im Normalfall

**4. `useFrameCapture.ts` als optional markieren**
- Nicht mehr kritisch für die Transition-Darstellung
- Kann weiterhin für Thumbnails oder andere Zwecke existieren

### Betroffene Dateien
- `src/components/directors-cut/DirectorsCutPreviewPlayer.tsx` — zweites Video-Element + ref
- `src/components/directors-cut/preview/useTransitionRenderer.ts` — CSS-basierte Dual-Video-Logik statt Canvas
- Diagnose-Logs werden nach dem Fix entfernt

### Warum das funktioniert
- Zwei `<video>`-Elemente ohne `crossOrigin` brauchen kein CORS
- CSS-Transitions (opacity, transform, clipPath) sind GPU-beschleunigt und performant
- `NativeTransitionLayer.tsx` beweist bereits, dass die CSS-Logik für alle Typen korrekt implementiert ist
- Der Browser compositet die zwei Video-Layer direkt — kein Canvas-Taint-Problem

### Ergebnis
- Alle Transition-Typen (Crossfade, Slide, Push, Wipe, Fade, Blur, Zoom) funktionieren
- Kein CORS-Problem mehr
- Vorschau zeigt sofort den gewählten Übergangstyp

