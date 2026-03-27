

## Fix: Übergänge stocken — `useTransitionInfo` verursacht 60 Re-Renders/Sekunde

### Kernproblem

`useTransitionInfo` (Zeile 302) läuft in einem eigenen rAF-Loop und ruft `setState` bei **jeder Fortschrittsänderung** auf — selbst mit dem 0.005-Throttle sind das ~30-60 State-Updates pro Sekunde während einer Transition. **Jedes State-Update rendert die gesamte Komponente neu**, inklusive beider `<video>`-Elemente mit ihren `style`-Props. Das verursacht das Stocken.

Das Problem: Die Transition-Styles (`transitionStyles.baseStyle`, `transitionStyles.incomingStyle`) werden als React `style`-Props auf die Videos gesetzt (Zeilen 636, 648-651). Jeder Re-Render erzwingt ein DOM-Update beider Video-Elemente.

### Lösung: Ref-basierte DOM-Manipulation statt React-State

Statt `useTransitionInfo` → `getTransitionStyles` → React Re-Render → DOM-Update den Umweg über React komplett eliminieren:

1. **Neuer Hook `useTransitionRenderer`** der direkt auf die Video-DOM-Elemente schreibt:
   - Nimmt `videoRef`, `incomingVideoRef`, `visualTimeRef`, `scenes`, `transitions`
   - Eigener rAF-Loop berechnet Transition-Progress
   - Schreibt `style.opacity`, `style.transform`, `style.clipPath` etc. **direkt auf die DOM-Elemente** — kein setState, kein Re-Render
   - Wenn keine Transition aktiv: setzt incoming auf `display: none`

2. **`useTransitionInfo` und `getTransitionStyles` entfernen** aus dem Player
   - Zeile 302-303: entfernen
   - Zeile 636: `style={{ filter: videoFilter }}` — kein `transitionStyles.baseStyle` mehr
   - Zeile 648-651: `style={{ filter: videoFilter }}` — kein `transitionStyles.incomingStyle` mehr
   - Der neue Hook übernimmt die Style-Steuerung direkt

3. **Ergebnis**: Während Transitions passieren **null React Re-Renders** für die Animation. Nur der rAF-Loop schreibt direkt ins DOM — genau wie eine CSS-Animation, aber mit voller Kontrolle.

### Betroffene Dateien
- `src/components/directors-cut/DirectorsCutPreviewPlayer.tsx` — useTransitionInfo/getTransitionStyles durch useTransitionRenderer ersetzen
- `src/components/directors-cut/preview/NativeTransitionLayer.tsx` — neuen `useTransitionRenderer` Hook hinzufügen (oder als separate Datei)

### Technische Kurzfassung
```text
Vorher:
  useTransitionInfo rAF → setState(progress) → React Re-Render
  → getTransitionStyles → style prop → DOM update
  = 60 React renders/sec während Transition

Nachher:
  useTransitionRenderer rAF → element.style.opacity = ... (direkt)
  = 0 React renders, 60 DOM writes/sec (wie CSS Animation)
```

