

## Fix: Filter und Übergänge in Schritt 4 (Style & Look) sichtbar machen

### Problem 1 — Filter werden nicht angewendet
Der `videoFilter` in `DirectorsCutPreviewPlayer.tsx` (Zeile 456-468) berechnet nur `brightness`, `contrast` und `saturation`. Die `effects.filter`-Eigenschaft (z.B. `"cinematic"`, `"vintage"`) und szenenspezifische Filter aus `sceneEffects[sceneId].filter` werden **komplett ignoriert**.

Die CSS-Strings dafür existieren bereits in `AVAILABLE_FILTERS[].preview` (z.B. `'saturate(1.35) contrast(1.3) brightness(0.95)'` für Cinematic).

### Problem 2 — Übergänge nicht sichtbar in Schritt 4
`StepLayoutWrapper` übergibt `transitions` korrekt an `DirectorsCutPreviewPlayer`. Das Problem ist wahrscheinlich dasselbe wie in Schritt 3 zuvor — der rAF-Loop und die Frame-Capture-Fixes greifen bereits. Falls die Übergänge in Schritt 3 funktionieren, sollten sie auch in Schritt 4 funktionieren, sobald der Player dieselben Props bekommt.

### Lösung

**`src/components/directors-cut/DirectorsCutPreviewPlayer.tsx`**

Den `videoFilter`-useMemo erweitern:

1. **Globalen Filter einbeziehen**: Wenn `effects.filter` gesetzt ist, den passenden CSS-String aus `AVAILABLE_FILTERS` nachschlagen und anhängen
2. **Szenenspezifischen Filter einbeziehen**: Per `currentTime` die aktuelle Szene ermitteln, dann `sceneEffects[currentScene.id]?.filter` prüfen — dieser hat Vorrang vor dem globalen Filter
3. Import von `AVAILABLE_FILTERS` aus `@/types/directors-cut` hinzufügen

```tsx
// Pseudo-Code der Erweiterung
const videoFilter = useMemo(() => {
  const filters: string[] = [];
  
  // Bestehende brightness/contrast/saturation...
  
  // Aktiven Filter ermitteln (szenen-spezifisch > global)
  const currentScene = sortedScenes.find(s => displayTime >= s.start_time && displayTime < s.end_time);
  const activeFilterId = (currentScene && sceneEffects[currentScene.id]?.filter) || effects.filter;
  
  if (activeFilterId && activeFilterId !== 'none') {
    const filterDef = AVAILABLE_FILTERS.find(f => f.id === activeFilterId);
    if (filterDef?.preview) {
      filters.push(filterDef.preview);
    }
  }
  
  return filters.length > 0 ? filters.join(' ') : undefined;
}, [effects, sceneEffects, sortedScenes, displayTime]);
```

### Was sich ändert
- Filter wie "Cinematic", "Vintage", "Noir" etc. werden live auf dem Video sichtbar
- Szenenspezifische Filter überschreiben den globalen Filter korrekt
- Gilt für alle Steps, die `StepLayoutWrapper` verwenden

### Was sich nicht ändert
- Transition-Logik bleibt unberührt
- Single-Video-Architektur bleibt
- Finaler Export bleibt unverändert

### Dateien
- `src/components/directors-cut/DirectorsCutPreviewPlayer.tsx` — einzige Änderung

