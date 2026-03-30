

## Fix: Crossfade + Ruckler nach Übergängen 2 und 3

### Problem 1: Crossfade funktioniert nicht sichtbar
In `NativeTransitionLayer.tsx` (Zeile 103-106) ist die Crossfade-Formel zu schwach:
```
baseStyle = { opacity: 1 - progress * 0.3 }  // Base geht nur von 1.0 → 0.7
incomingStyle = { opacity: progress }          // Incoming geht von 0 → 1
```
Das sieht aus, als würde das neue Bild einfach über das alte gelegt werden — kein echter Crossfade. Für einen sichtbaren Crossfade muss das Base-Video auf 0 runtergehen.

### Problem 2: Ruckler nach Übergang 2 und 3
Wenn eine Transition endet (`time >= tEnd`):
1. `useTransitionRenderer` versteckt das Incoming-Video und zeigt nur das Base-Video
2. Aber das Base-Video steht noch bei der Source-Time der **alten** Szene (es hat während der Transition weiter über die Grenze hinaus gespielt)
3. Die Boundary-Crossing-Logik im Haupt-RAF-Loop (Zeile 564) erkennt, dass es seeken muss → **sichtbarer Ruck**

### Lösung

**1. `NativeTransitionLayer.tsx` — Crossfade-Formel korrigieren**
```typescript
case 'crossfade':
case 'dissolve':
  baseStyle = { opacity: 1 - progress };   // Voll ausfaden
  incomingStyle = { opacity: progress };     // Voll einfaden
```

**2. `useTransitionRenderer.ts` — Base-Video am Transitions-Ende synchronisieren**
Wenn `wasActiveRef` von `true` auf `false` wechselt (Transition gerade beendet), das Base-Video auf die aktuelle Position des Incoming-Videos seeken. So gibt es keinen sichtbaren Sprung:
```typescript
if (wasActiveRef.current) {
  wasActiveRef.current = false;
  lastIncomingSeekRef.current = '';
  // Sync base video to incoming video position to prevent jerk
  if (incoming.currentTime > 0) {
    base.currentTime = incoming.currentTime;
  }
}
```

### Betroffene Dateien
- `src/components/directors-cut/preview/NativeTransitionLayer.tsx` — Crossfade-Opacity
- `src/components/directors-cut/preview/useTransitionRenderer.ts` — Base-Sync nach Transition

### Ergebnis
- Crossfade zeigt einen echten, sichtbaren Überblendeffekt
- Kein Ruckler mehr nach Übergängen 2 und 3

