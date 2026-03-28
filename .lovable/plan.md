

## Fix: Übergänge 0.5s zu früh — Timeline-Mapping während Transitions

### Problem

Das Video-led Playback hat ein Mapping-Problem an Szenengrenzen:

1. **Zeile 366**: `timelineTime` wird auf `scene.end_time` geclampt — aber während einer Transition muss die Zeit **darüber hinaus** weiterlaufen (70% des Übergangs passiert NACH der Grenze)
2. **Zeile 345**: `findSceneBySourceTime` hat nur 0.05s Toleranz — sobald das Video 50ms über das Source-Ende der Outgoing-Szene hinaus spielt, findet es keine Szene mehr und fällt auf `timelineTime = videoSourceTime` (Zeile 418), was bei nicht-linearem Scene-Mapping falsch ist
3. **Ergebnis**: Der `visualTimeRef`-Wert springt oder stagniert an Szenengrenzen, was die Transition im Canvas-Renderer ~0.5s zu früh erscheinen lässt

### Lösung

Den rAF-Loop so anpassen, dass er während einer Transition die Timeline-Zeit korrekt weiterberechnet:

**In `findSceneBySourceTime` (Zeile 339-350):**
- Toleranz am Ende auf **1.5s** erweitern (= maximale Transition-Dauer), damit die Outgoing-Szene während der Transition weiterhin gefunden wird

**In der Timeline-Berechnung (Zeile 363-366):**
- Clamping auf `scene.end_time` entfernen wenn eine aktive Transition läuft
- Stattdessen: Wenn `timelineTime > scene.end_time`, prüfen ob eine Transition aktiv ist → wenn ja, Timeline weiter hochzählen lassen (das Video spielt natürlich weiter, die Source-Time mapped korrekt auf die Zeit nach der Grenze)

**Konkreter Ansatz:**
```typescript
// Zeile 363-366 — Clamping nur ohne aktive Transition
if (sceneInfo) {
  timelineTime = sourceToTimelineTime(sceneInfo.scene, videoSourceTime);
  
  // Nur clampen wenn KEINE Transition aktiv ist
  const activeTrans = findActiveTransition(timelineTime);
  if (!activeTrans) {
    timelineTime = Math.max(sceneInfo.scene.start_time, Math.min(timelineTime, sceneInfo.scene.end_time));
  }
}
```

```typescript
// Zeile 344-345 — Großzügigere Toleranz am Source-Ende für Transitions
const srcEnd = srcStart + (s.end_time - s.start_time) * rate;
if (sourceTime >= srcStart - 0.05 && sourceTime < srcEnd + 1.5) {
  return { scene: s, index: i };
}
```

### Dateien
- `src/components/directors-cut/DirectorsCutPreviewPlayer.tsx` — `findSceneBySourceTime` Toleranz + Clamping-Fix

### Ergebnis
- Transitions starten und enden zeitlich korrekt
- Kein Stottern (Video-led bleibt erhalten)
- Alle 3 Übergänge synchron zur erwarteten Position

