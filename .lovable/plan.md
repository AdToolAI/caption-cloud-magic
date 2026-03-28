

## Fix: Timing-Offset-Slider hat keinen Effekt im Preview

### Ursache (gefunden)

Im rAF-Loop gibt es zwei unabhängige Zeitberechnungen:

1. **`findActiveTransition`** (Zeile 134-162): Berechnet die Transition-Fenster mit `offsetSeconds`:
   ```
   boundary = original_end_time + offset   // z.B. 12.5 + 0.5 = 13.0
   tStart = boundary - leadIn              // 13.0 - 0.06 = 12.94
   ```

2. **Boundary-Crossing-Logik** (Zeile 453-475): Erkennt das Szenenende **ohne** Offset:
   ```
   srcEnd = srcStart + duration * rate      // z.B. 12.5
   if (videoSourceTime >= srcEnd - 0.02)    // Feuert bei 12.48!
   ```

**Das Problem**: Bei positivem Offset (+0.5s) erreicht das Video `srcEnd` (12.48s) **bevor** die Transition startet (12.94s). Da `cachedActiveTrans` zu dem Zeitpunkt noch `null` ist, feuert die Boundary-Logik und seekt direkt zur nächsten Szene. Die Transition hat keine Chance, am verschobenen Zeitpunkt zu erscheinen.

### Fix

Die Boundary-Crossing-Logik muss den Transition-Offset berücksichtigen. Wenn eine Transition mit positivem Offset existiert, darf die Boundary-Logik erst **nach** dem verschobenen Transition-Fenster feuern:

```typescript
// Zeile 453-458: Vor der Boundary-Prüfung den Offset checken
if (!cachedActiveTrans) {
  const sceneTransition = transitions.find(tr => tr.sceneId === sceneInfo.scene.id);
  const transOffset = sceneTransition?.offsetSeconds ?? 0;
  
  // Wenn ein positiver Offset existiert und wir noch VOR dem 
  // verschobenen Transition-Fenster sind → NICHT seeken, 
  // das Video weiterlaufen lassen bis die Transition beginnt
  const srcStart = sceneInfo.scene.original_start_time ?? sceneInfo.scene.start_time;
  const rate = (sceneInfo.scene as any).playbackRate ?? 1;
  const srcEnd = srcStart + (sceneInfo.scene.end_time - sceneInfo.scene.start_time) * rate;
  const effectiveBoundary = srcEnd + transOffset;

  if (videoSourceTime >= effectiveBoundary - 0.02) {
    // Erst jetzt zur nächsten Szene springen
    // (bei offset=0 identisch zum bisherigen Verhalten)
    ...
  }
}
```

### Betroffene Datei
- `src/components/directors-cut/DirectorsCutPreviewPlayer.tsx` — Boundary-Crossing-Logik (Zeile 453-475): `srcEnd` durch `srcEnd + transOffset` ersetzen

### Ergebnis
- Der Timing-Slider verschiebt den Übergang tatsächlich im Preview
- Positiver Offset = Video läuft länger in der aktuellen Szene bevor der Übergang startet
- Negativer Offset = Übergang startet etwas vor dem Szenenende
- Kein Stottern, kein Loop — nur eine Zeile Logik angepasst

