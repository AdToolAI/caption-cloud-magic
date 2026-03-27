

## Fix: Übergänge sichtbar machen — eigener rAF-Loop im Overlay

### Ursache
`NativeTransitionOverlay` bekommt `currentTime={displayTime}` (aktualisiert alle 250ms) und liest `visualTimeRef.current` in einem `useMemo`. Aber `useMemo` wird nur bei React-Rerenders ausgewertet — also auch nur alle 250ms. Ein 0.8s-Übergang hat damit nur ~3 Schritte statt ~48. Der Übergang ist praktisch unsichtbar.

### Lösung
Das Overlay bekommt seinen **eigenen `requestAnimationFrame`-Loop**, der `visualTimeRef.current` auf 60fps liest und einen lokalen `smoothTime`-State pflegt. Damit animieren Übergänge flüssig und unabhängig vom React-Render-Takt.

### Änderungen

**`src/components/directors-cut/preview/NativeTransitionOverlay.tsx`**

1. Neuen `useState` für `smoothTime` + eigener rAF-Loop:
```tsx
const [smoothTime, setSmoothTime] = useState(currentTime);
const smoothRafRef = useRef<number>();

useEffect(() => {
  const tick = () => {
    const t = visualTimeRef?.current ?? currentTime;
    setSmoothTime(t);
    smoothRafRef.current = requestAnimationFrame(tick);
  };
  smoothRafRef.current = requestAnimationFrame(tick);
  return () => { if (smoothRafRef.current) cancelAnimationFrame(smoothRafRef.current); };
}, [currentTime, visualTimeRef]);
```

2. `overlayInfo`-useMemo verwendet `smoothTime` statt `time`
3. Alles andere bleibt identisch — Frame-Capture, Transition-Typen, Easing

### Was sich nicht ändert
- Kein neuer Video-Decoder
- Kein `backdropFilter`
- Single-Video-Architektur bleibt
- Finaler Export bleibt unverändert

### Erwartetes Ergebnis
- Übergänge animieren auf 60fps statt 4fps
- Crossfade, Wipe, Slide, Zoom werden klar sichtbar
- Keine zusätzlichen Stotterer (nur ein leichter State-Update pro Frame im Overlay)

### Dateien
- `src/components/directors-cut/preview/NativeTransitionOverlay.tsx` — einzige Änderung

