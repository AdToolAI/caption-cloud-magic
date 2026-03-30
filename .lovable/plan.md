

## Fix: Crossfade/Dissolve-Stocken bei Übergängen 1 und 2

### Ursache

Das Stocken hat zwei Quellen:

1. **Incoming-Video nicht spielbereit**: Der Pre-Seek (0.5s vorher) setzt nur `incoming.currentTime`, startet aber das Video nicht. Beim Crossfade-Start ist `incoming.paused && readyState >= 2` oft noch nicht erfüllt → die ersten Frames zeigen ein schwarzes/eingefrorenes Incoming-Bild während das Base bereits ausblendet.

2. **Base-Seek am Transitions-Ende**: `base.currentTime = incoming.currentTime` löst einen Browser-Seek aus → sichtbarer Stutter-Frame.

### Lösung

**1. `useTransitionRenderer.ts` — Incoming im Pre-Seek-Window bereits abspielen**

Im Pre-Seek-Block (Zeile 72-78): Nach dem Seek das Incoming-Video sofort starten (muted, da es noch unsichtbar ist). So ist es beim Crossfade-Start bereits am Laufen und hat Frames decodiert.

```typescript
// PRE-SEEK: prepare incoming video before transition starts
if (time >= rt.tStart - PRE_SEEK_WINDOW && time < rt.tStart) {
  seekIncoming(rt.incomingSceneId, scenes);
  // Start playing early so frames are decoded when transition begins
  if (incoming.paused && incoming.readyState >= 2) {
    incoming.style.display = 'none';  // still hidden
    incoming.play().catch(() => {});
  }
}
```

**2. `useTransitionRenderer.ts` — Base-Seek am Ende weicher machen**

Statt harten Seek (`base.currentTime = incoming.currentTime`) einen `fastSeek()` verwenden (wenn verfügbar), und den Seek nur ausführen wenn die Differenz signifikant ist (> 0.1s). Bei kleinen Differenzen springt das Video ohnehin nicht sichtbar.

```typescript
if (wasActiveRef.current) {
  wasActiveRef.current = false;
  lastIncomingSeekRef.current = '';
  const diff = Math.abs(base.currentTime - incoming.currentTime);
  if (incoming.currentTime > 0 && diff > 0.1) {
    if (base.fastSeek) {
      base.fastSeek(incoming.currentTime);
    } else {
      base.currentTime = incoming.currentTime;
    }
  }
}
```

### Betroffene Datei
- `src/components/directors-cut/preview/useTransitionRenderer.ts`

### Ergebnis
- Incoming-Video ist beim Crossfade-Start bereits am Laufen → kein schwarzer Frame
- Base-Seek am Ende ist sanfter → kein Stutter-Frame nach dem Übergang

