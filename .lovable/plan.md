

## Fix: Übergänge 0.3–0.5s zu früh — Timing korrigieren

### Ursache

In `NativeTransitionOverlay.tsx` Zeile 98:
```tsx
const transitionStart = scene.end_time - transitionDuration;
```

Der Übergang beginnt `transitionDuration` (0.6–0.8s) **vor** dem Ende der Szene. Das Problem: Der Übergang soll die Szene **am Ende** überblenden, aber er startet so früh, dass man den Übergang sieht und danach noch kurz die alte Szene "nackt" sieht, bevor die nächste beginnt.

Die `end_time` der KI-Analyse markiert den letzten Frame der Szene. Der Übergang sollte so enden, dass er **genau** bei `end_time` abgeschlossen ist — das tut er auch. Aber das visuelle Problem ist, dass der Übergang zu weit vor dem eigentlichen Schnitt startet.

### Lösung

Den Übergangsstart um ~0.4s nach hinten verschieben, sodass der Übergang **über die Szenengrenze hinweg** läuft statt komplett davor:

**`src/components/directors-cut/preview/NativeTransitionOverlay.tsx`** (Zeile 97–100)

```tsx
const transitionDuration = Math.max(MIN_TRANSITION_DURATION, transition.duration || TRANSITION_DURATION);
// Übergang zentriert auf die Szenengrenze: beginnt vor end_time, endet nach end_time
const halfDuration = transitionDuration / 2;
const transitionStart = scene.end_time - halfDuration;
const transitionEnd = scene.end_time + halfDuration;

if (time >= transitionStart && time < transitionEnd) {
  const rawProgress = (time - transitionStart) / transitionDuration;
```

So startet der Übergang nur ~0.3–0.4s vor dem Szenenwechsel und läuft über die Grenze hinaus — genau wie man es visuell erwartet.

### Was sich ändert
- Übergänge starten ~0.4s später (zentriert auf die Szenengrenze)
- Kein "zu früh"-Effekt mehr

### Was sich nicht ändert
- Übergangsdauer bleibt gleich (0.6–0.8s)
- Easing, Frame-Capture, rAF-Loop bleiben identisch
- Finaler Export unberührt

### Dateien
- `src/components/directors-cut/preview/NativeTransitionOverlay.tsx` — einzige Änderung

