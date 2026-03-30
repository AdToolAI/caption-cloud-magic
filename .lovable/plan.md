

## Fix: Übergänge (Crossfade, Dissolve etc.) werden nicht angezeigt

### Root Cause

Die JSX-Definition des Incoming-Videos (Zeile 967) enthält:
```tsx
style={{ zIndex: 2, opacity: 0, pointerEvents: 'none' }}
```

React setzt diese Inline-Styles bei **jedem Re-Render** zurück. Da `displayTime` alle 250ms aktualisiert wird (`setDisplayTime`), überschreibt React regelmäßig die vom Transition-Renderer imperativ gesetzten `opacity`-Werte.

Der RAF-Loop setzt z.B. `incoming.style.opacity = '0.5'` für Crossfade → 16ms später rendert React und setzt `opacity: 0` zurück → der Übergang ist unsichtbar.

**Warum Slide trotzdem funktioniert:** Bei Slide ist `transform` (nicht `opacity`) der sichtbare Effekt. React setzt kein `transform` im JSX, also wird es nicht überschrieben.

### Lösung

**1. `DirectorsCutPreviewPlayer.tsx` — Incoming-Video JSX (Zeile 967):**

`opacity` und `pointerEvents` aus dem JSX-Style entfernen. Nur `zIndex` behalten:

```tsx
// Vorher:
style={{ zIndex: 2, opacity: 0, pointerEvents: 'none' }}

// Nachher:
style={{ zIndex: 2 }}
```

**2. `DirectorsCutPreviewPlayer.tsx` — useEffect für Initial-Styling:**

Nach dem Mount einmalig die Default-Sichtbarkeit setzen, damit das Incoming-Video initial versteckt ist — aber imperativ, nicht deklarativ:

```tsx
useEffect(() => {
  const incoming = incomingVideoRef.current;
  if (incoming) {
    incoming.style.opacity = '0';
    incoming.style.pointerEvents = 'none';
  }
}, []);
```

**3. Base-Video JSX (Zeile 955):** `filter` aus dem JSX-Style entfernen, da der Renderer und `computeFilterForTime` dies bereits imperativ steuern:

```tsx
// Vorher:
style={{ filter: videoFilter, zIndex: 1 }}

// Nachher:
style={{ zIndex: 1 }}
```

Ohne diese Änderung überschreibt React auch den Base-Filter bei jedem Re-Render, was zu den bekannten Filter-Flicker-Problemen beiträgt.

### Betroffene Datei
- `src/components/directors-cut/DirectorsCutPreviewPlayer.tsx` — 3 kleine Änderungen (JSX-Styles + Init-useEffect)

### Ergebnis
- React kann die vom Renderer gesetzten `opacity`-Werte nicht mehr überschreiben
- Crossfade, Dissolve, Fade, Blur werden durchgehend sichtbar
- Slide/Push/Wipe bleiben unverändert funktional
- Filter-Flackern am Szenenwechsel wird ebenfalls reduziert

