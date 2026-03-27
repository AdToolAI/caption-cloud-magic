

## Fix: Übergänge werden nicht angezeigt — CORS-Problem bei Frame-Capture

### Ursache
In `NativeTransitionOverlay.tsx` (Zeile 50-86) wird ein verstecktes `<video>`-Element erstellt, um den ersten Frame jeder Szene zu capturen. Aber:

1. **`crossOrigin` fehlt** — das Video kommt von Supabase Storage (andere Origin). Ohne `video.crossOrigin = 'anonymous'` wird der Canvas "tainted" und `canvas.toDataURL()` wirft einen SecurityError
2. **Leerer `catch`-Block** (Zeile 77) schluckt den Fehler komplett — kein Frame wird gecached
3. Ohne gecachte Frames gibt `getNextFrameStyle()` `display: none` zurück → kein sichtbarer Übergang

### Lösung

**`src/components/directors-cut/preview/NativeTransitionOverlay.tsx`**

1. `crossOrigin = 'anonymous'` auf dem versteckten Capture-Video setzen (Zeile 52)
2. Fallback für den Fall, dass Frame-Capture trotzdem fehlschlägt (z.B. CORS-Header fehlen):
   - Statt `display: none` bei fehlendem Frame → einfarbigen schwarzen/dunklen Overlay als Fallback verwenden
   - So sind Übergänge (Wipe, Slide, Fade) auch ohne Snapshot sichtbar
3. `catch`-Block mit `console.warn` versehen, damit Fehler nicht mehr lautlos verschluckt werden

### Konkreter Code-Plan

```tsx
// Zeile 50-53: crossOrigin setzen
const video = document.createElement('video');
video.preload = 'auto';
video.muted = true;
video.crossOrigin = 'anonymous';  // NEU
video.src = videoUrl;

// Zeile 77: catch nicht mehr leer
} catch (e) { 
  console.warn('Frame capture failed for scene', sceneId, e); 
}
```

```tsx
// getNextFrameStyle: Fallback wenn kein Frame vorhanden
const getNextFrameStyle = (): React.CSSProperties => {
  const bgBase: React.CSSProperties = nextFrame 
    ? {
        backgroundImage: `url(${nextFrame})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
        backgroundColor: '#000',
      }
    : { backgroundColor: '#000' };  // Fallback: schwarzer Overlay
  
  // ... rest der switch/case Logik bleibt gleich
};

// Render: auch ohne nextFrame den Overlay anzeigen
{(nextFrame || overlayInfo) && (
  <div ... style={getNextFrameStyle()} />
)}
```

### Was sich ändert
- Frame-Capture funktioniert bei CORS-fähigem Storage
- Falls CORS trotzdem blockt: Übergänge zeigen einen schwarzen Overlay statt gar nichts
- Slide/Wipe/Fade werden in jedem Fall sichtbar

### Was sich nicht ändert
- Single-Video-Architektur
- rAF-Loop für flüssige Animation
- Finaler Export unberührt

### Dateien
- `src/components/directors-cut/preview/NativeTransitionOverlay.tsx` — einzige Änderung

