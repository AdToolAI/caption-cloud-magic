

## Fix: Helligkeit/Kontrast/Sättigung werden nicht im Preview angezeigt

### Ursache

Im `DirectorsCutPreviewPlayer` wird `currentScene` anhand von `displayTime` bestimmt (Zeile 746-748):
```typescript
const currentScene = sortedScenes.find(s => displayTime >= s.start_time && displayTime < s.end_time);
```

**Problem 1**: Wenn das Video bei `displayTime = 0` steht und die erste Szene bei z.B. `0.167s` beginnt (typisch bei KI-Analyse), ist `currentScene = undefined`. Damit werden szenen-spezifische Effekte (`sceneEffects[sceneId].brightness` etc.) komplett ignoriert und es fällt auf die globalen Werte (unverändert = 100) zurück.

**Problem 2**: Der RAF-Loop in `useTransitionRenderer` überschreibt `base.style.filter` auf **jedem Frame** mit `videoFilterRef.current`. Wenn der `useEffect` für den Ref-Sync noch nicht gelaufen ist (z.B. beim ersten Render), kann kurzzeitig der alte Wert angewendet werden.

### Lösung

**1. `DirectorsCutPreviewPlayer.tsx` — `currentScene` Lookup toleranter machen**
- Wenn kein exakter Match gefunden wird, die nächstliegende Szene wählen (besonders für `displayTime < scenes[0].start_time`)
- Damit werden szenen-spezifische Slider-Änderungen sofort sichtbar, auch wenn der Playhead am Anfang steht

```typescript
const currentScene = useMemo(() => {
  const exact = sortedScenes.find(s => displayTime >= s.start_time && displayTime < s.end_time);
  if (exact) return exact;
  // Fallback: if before first scene, use first scene
  if (sortedScenes.length > 0 && displayTime < sortedScenes[0].start_time) {
    return sortedScenes[0];
  }
  // Fallback: if after last scene, use last scene
  if (sortedScenes.length > 0) {
    return sortedScenes[sortedScenes.length - 1];
  }
  return undefined;
}, [sortedScenes, displayTime]);
```

**2. `useTransitionRenderer.ts` — videoFilterRef sofort synchron lesen**
- Der Ref-Sync (`useEffect`) ist bereits korrekt, aber zur Sicherheit: Im "No Transition"-Pfad den `videoFilterRef.current` Wert verwenden (bereits der Fall). Dies ist kein Code-Change, nur Bestätigung dass der Pfad korrekt ist.

### Betroffene Datei
- `src/components/directors-cut/DirectorsCutPreviewPlayer.tsx` — `currentScene` useMemo erweitern (ca. 5 Zeilen Änderung)

### Ergebnis
- Helligkeit, Kontrast, Sättigung etc. werden sofort im Preview sichtbar wenn per Slider geändert
- Funktioniert sowohl für globale als auch szenen-spezifische Änderungen
- Kein Layout- oder Timing-Problem, da nur die Scene-Lookup-Logik angepasst wird

