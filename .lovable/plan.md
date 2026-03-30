

## Fix: Crossfade/Dissolve frieren ein + Ruckler danach

### Problem

Zwei zusammenhängende Ursachen:

**1. Incoming-Video startet nicht rechtzeitig**
Im Pre-Seek-Window und beim Transition-Start wird `incoming.play()` nur aufgerufen wenn `readyState >= 2`. Nach einem Seek fällt `readyState` auf 0/1 zurück — das Video bleibt stumm/schwarz während das Base bereits ausblendet. Bei Crossfade/Dissolve ist das fatal, weil beide Opacity-gesteuert sind (Base geht auf 0, Incoming bleibt auf 0 = schwarzer Frame).

**2. Post-Transition-Seek verursacht Ruckler**
Nach jeder Transition wird `base.currentTime = incoming.currentTime` gesetzt (Zeile 174-180). Dieser Seek löst einen Browser-Decode-Stall aus → sichtbares Hängen für ~100ms. Zusätzlich kollidiert dieser Seek mit der Boundary-Crossing-Logik im Haupt-RAF-Loop (Zeile 564), die ebenfalls einen Seek auslöst.

### Lösung

**Datei: `src/components/directors-cut/preview/useTransitionRenderer.ts`**

**A) Incoming-Video robuster starten**
- `readyState >= 2` Check entfernen — stattdessen immer `play()` aufrufen (Browser puffert automatisch)
- Im Pre-Seek-Window: `incoming.play()` ohne readyState-Guard
- Im Active-Transition-Block: ebenfalls ohne readyState-Guard
- Zusätzlich: `canplay`-Event-Listener als Fallback registrieren, der `play()` beim ersten verfügbaren Frame aufruft

**B) Post-Transition-Seek eliminieren**
- Den `base.currentTime = incoming.currentTime` Sync komplett entfernen
- Stattdessen: Die Boundary-Crossing-Logik im Haupt-Player (DirectorsCutPreviewPlayer) übernimmt den Szenenwechsel bereits korrekt
- Der Transition-Renderer muss am Ende nur die Styles zurücksetzen, nicht die Video-Position ändern

Konkret:
```typescript
// PRE-SEEK block — remove readyState guard
if (incoming.paused) {
  incoming.play().catch(() => {});
}

// ACTIVE TRANSITION block — remove readyState guard  
if (incoming.paused) {
  incoming.play().catch(() => {});
}

// POST-TRANSITION — remove the sync seek entirely
if (wasActiveRef.current) {
  wasActiveRef.current = false;
  lastIncomingSeekRef.current = '';
  // NO base.currentTime sync — let the main player handle scene advance
}
```

### Betroffene Datei
- `src/components/directors-cut/preview/useTransitionRenderer.ts`

### Ergebnis
- Crossfade/Dissolve zeigen sofort das Incoming-Video (kein schwarzer Frame)
- Kein doppelter Seek am Transitions-Ende = kein Ruckler
- Slide-Übergänge bleiben unverändert (funktionieren bereits)

