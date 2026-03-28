

## Fix: Schritt 5 Farbkorrektur-Effekte im Preview sichtbar machen

### Probleme gefunden

Der Preview Player ignoriert mehrere Effekte komplett:

1. **Sharpness, Temperature, Vignette** — werden in der UI als Slider angeboten, aber im `videoFilter`-Memo des Preview Players **nie in CSS umgesetzt**
2. **Scene-spezifische Brightness/Contrast/Saturation** — Die `sceneEffects` werden zwar an den Player übergeben, aber im `videoFilter`-Memo werden nur die **globalen** `effects.brightness` etc. gelesen. Scene-spezifische Werte (`sceneEffects[sceneId].brightness`) werden komplett ignoriert
3. **Color Grading** — wird als Prop übergeben, aber ich muss prüfen ob es tatsächlich visuell angewendet wird

### Lösung

**Datei: `src/components/directors-cut/DirectorsCutPreviewPlayer.tsx`** — `videoFilter` Memo erweitern:

1. **Scene-spezifische Werte priorisieren**: Für brightness/contrast/saturation zuerst `sceneEffects[currentScene.id]` prüfen, dann auf globale `effects` fallbacken
2. **Sharpness** → CSS `contrast()` leicht verstärken (kein natives CSS-Sharpness, aber Kombination aus `contrast` + SVG-Filter simuliert es)
3. **Temperature** → `sepia()` + `hue-rotate()` Kombination (warm = sepia+leichter hue-rotate, kalt = hue-rotate ins Blaue)
4. **Vignette** → Kein CSS-Filter, sondern ein **Overlay-Div** mit `radial-gradient` über dem Video
5. **Color Grading** → Prüfen ob das CSS overlay korrekt gerendert wird

### Technische Details

```typescript
// Scene-spezifische Werte priorisieren
const currentScene = sortedScenes.find(s => displayTime >= s.start_time && displayTime < s.end_time);
const sceneFx = currentScene ? sceneEffects?.[currentScene.id] : undefined;
const bright = sceneFx?.brightness ?? effects.brightness ?? 100;
const contr = sceneFx?.contrast ?? effects.contrast ?? 100;
const sat = sceneFx?.saturation ?? effects.saturation ?? 100;
const sharp = sceneFx?.sharpness ?? effects.sharpness ?? 0;
const temp = sceneFx?.temperature ?? effects.temperature ?? 0;

// Temperature → sepia + hue-rotate
if (temp > 0) filters.push(`sepia(${temp/100})`, `saturate(${1 + temp/100})`);
if (temp < 0) filters.push(`hue-rotate(${temp * 1.5}deg)`);

// Sharpness → leichter contrast-boost
if (sharp > 0) { /* extra contrast micro-boost */ }
```

Vignette als separates Overlay-Div:
```tsx
{effects.vignette > 0 && (
  <div style={{
    position: 'absolute', inset: 0, zIndex: 5,
    background: `radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,${effects.vignette/100}) 100%)`,
    pointerEvents: 'none'
  }} />
)}
```

### Dateien
- `src/components/directors-cut/DirectorsCutPreviewPlayer.tsx` — videoFilter Memo + Vignette Overlay

