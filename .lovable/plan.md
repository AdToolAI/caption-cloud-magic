

## Fix: Ruckler nach Übergängen glätten

### Ursache

Wenn eine Transition endet (active → idle), passieren zwei Dinge, die den Ruckler verursachen:

1. **Kein Video-Handoff**: Der Renderer pausiert das Incoming-Video und blendet es aus, aber das Base-Video steht noch an der Position der alten Szene. Erst danach erkennt der Boundary-Check (Zeile 581) die Szenengrenze und macht `video.currentTime = nextSourceStart` — das ist ein harter Seek, der einen sichtbaren Frame-Sprung erzeugt.

2. **Cooldown zu kurz**: Der Cooldown ist 10 Frames (~160ms bei 60fps). Bei langsamen Seeks oder wenn das Video noch buffert, kann der Boundary-Check trotzdem feuern, bevor das Video smooth weiterspielt.

### Lösung

**Im Transition-Renderer** (`useTransitionRenderer.ts`): Beim Übergang `active → idle` das Base-Video auf die aktuelle Position des Incoming-Videos synchronisieren, **bevor** das Incoming pausiert und ausgeblendet wird. So sieht der Nutzer keinen Sprung.

**Cooldown erhöhen**: Von 10 auf 30 Frames (~500ms), damit der Boundary-Check nach dem Handoff sicher unterdrückt bleibt.

### Konkrete Änderungen

**`src/components/directors-cut/preview/useTransitionRenderer.ts`** — Zeile 187-211 (idle-Reset):

```typescript
if (phaseRef.current !== 'idle') {
  // Sync base video to incoming position BEFORE hiding incoming
  // This prevents the visible jump when switching layers
  const base = baseVideoRef.current;
  if (base && incoming.currentTime > 0 && !incoming.paused) {
    const diff = Math.abs(base.currentTime - incoming.currentTime);
    if (diff > 0.05) {
      base.currentTime = incoming.currentTime;
    }
  }

  // Now clean up incoming
  if (!incoming.paused) incoming.pause();
  incoming.style.pointerEvents = 'none';
  incoming.style.opacity = '0';
  // ... rest of cleanup ...

  if (transitionCooldownRef) {
    transitionCooldownRef.current = 30; // increased from 10
  }
  
  phaseRef.current = 'idle';
}
```

### Betroffene Datei
- `src/components/directors-cut/preview/useTransitionRenderer.ts` — Base-Sync + Cooldown-Erhöhung

### Ergebnis
- Base-Video springt nicht mehr sichtbar nach Transitions-Ende
- Boundary-Check wird lang genug unterdrückt, um doppelte Seeks zu vermeiden
- Übergänge enden smooth ohne Ruckler

