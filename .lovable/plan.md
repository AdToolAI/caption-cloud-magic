

## Fix: Crossfade/Dissolve-Übergänge nicht sichtbar

### Root Cause

Die Incoming-Video hat in der JSX-Definition `style={{ zIndex: 2, display: 'none' }}` (Zeile 965 in `DirectorsCutPreviewPlayer.tsx`). Alle 250ms ruft der Player `setDisplayTime()` auf → React re-rendert → setzt `display: 'none'` zurück auf das Incoming-Video, egal was der Transition-Renderer vorher imperativ gesetzt hat.

```text
RAF-Frame 1: Renderer setzt incoming.style.display = ''  (sichtbar)
RAF-Frame 2: Crossfade läuft korrekt
...
250ms später: React re-render → style={{ display: 'none' }} überschreibt
RAF-Frame N: Renderer setzt display = '' zurück (16ms Verzögerung)
```

Bei Slide/Push fällt das kaum auf, weil das Incoming-Element über `transform` positioniert wird und die kurze Unsichtbarkeit durch Bewegung maskiert wird. Bei Crossfade/Dissolve ist das fatal — das Incoming-Video flackert alle 250ms unsichtbar, und der Überblendeffekt ist praktisch nicht erkennbar.

### Lösung

**1. `DirectorsCutPreviewPlayer.tsx` — Zeile 965:** React-Style von `display: 'none'` auf `opacity: 0` ändern. Damit kämpft React nicht mehr gegen den Renderer:

```tsx
// Vorher:
style={{ zIndex: 2, display: 'none' }}

// Nachher:
style={{ zIndex: 2, opacity: 0, pointerEvents: 'none' }}
```

**2. `useTransitionRenderer.ts` — Inaktive Phase (Zeilen 176-188):** Statt `display: 'none'` durchgängig `opacity: 0` und `pointerEvents: 'none'` nutzen, um React-Style-Konflikte zu vermeiden:

```typescript
// Statt:
incoming.style.display = 'none';
incoming.style.opacity = '0';

// Nachher:
incoming.style.opacity = '0';
incoming.style.pointerEvents = 'none';
// display bleibt unverändert (kein Kampf mit React)
```

**3. `useTransitionRenderer.ts` — Aktive Phase (Zeile 137):** Statt `display: ''` die Sichtbarkeit über `opacity` und `pointerEvents` steuern:

```typescript
// Statt:
incoming.style.display = '';

// Nachher:
incoming.style.pointerEvents = '';
// opacity wird bereits durch getTransitionStyles gesetzt
```

### Betroffene Dateien
- `src/components/directors-cut/DirectorsCutPreviewPlayer.tsx` — JSX-Style des Incoming-Video
- `src/components/directors-cut/preview/useTransitionRenderer.ts` — display→opacity Wechsel

### Ergebnis
- React-Re-Renders können die Incoming-Video-Sichtbarkeit nicht mehr überschreiben
- Crossfade/Dissolve sind durchgehend sichtbar ohne 250ms-Flackern
- Slide/Push-Übergänge bleiben unverändert funktional

