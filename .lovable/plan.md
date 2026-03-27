

## Fix: Übergänge noch versetzt und zu kurz

### Analyse

Das Transition-Fenster ist aktuell **exakt zentriert** auf der Szenengrenze: 50% davor, 50% danach. Das bedeutet bei 1.2s Dauer startet der Übergang schon **0.6s vor** dem eigentlichen Szenenwechsel — das fühlt sich "zu früh" an, besonders bei kurzen Szenen.

Außerdem: Wenn das Base-Video während der Transition an `boundary` geclampt wird (Zeile 345: `Math.min(timelineTime, boundary)`), friert es in der zweiten Hälfte ein — sichtbarer Stillstand.

### Lösung: 2 gezielte Änderungen

#### 1) Transition-Fenster nach hinten verschieben (70/30 statt 50/50)
Statt `[boundary - half, boundary + half]` das Fenster asymmetrisch setzen: nur 30% der Dauer VOR der Grenze, 70% danach.

```text
Vorher: [boundary - 0.6, boundary + 0.6]  → Übergang startet "zu früh"
Nachher: [boundary - 0.36, boundary + 0.84] → natürlicherer Beginn
```

So spielt die ausgehende Szene länger bevor der Übergang sichtbar wird.

**Dateien:** `findActiveTransition` + `useTransitionRenderer` — beide nutzen `half` → ändern zu `leadIn = tDuration * 0.3` und `leadOut = tDuration * 0.7`

#### 2) Base-Video während Transition NICHT einfrieren
Zeile 345 clampt das Base-Video auf `boundary` — in der zweiten Hälfte der Transition friert das Bild ein. Stattdessen soll das Base-Video normal weiterlaufen bis zum Ende seines Szenen-Fensters:

```typescript
// Vorher:
sourceTimeForScene(outgoingScene, Math.min(timelineTime, boundary))
// Nachher:
sourceTimeForScene(outgoingScene, Math.min(timelineTime, outgoingScene.end_time))
```

### Dateien
- `src/components/directors-cut/DirectorsCutPreviewPlayer.tsx` — `findActiveTransition` asymmetrisch + Base-Video nicht einfrieren
- `src/components/directors-cut/preview/useTransitionRenderer.ts` — gleiche asymmetrische Fenster-Berechnung

