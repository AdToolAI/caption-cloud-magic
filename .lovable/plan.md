

## Fix: Universal Content Creator — Preview zeigt nur 4s + Render schlaegt fehl

### Ursache

**Problem 1 — Preview nur 4s:**
In `UniversalCreator.tsx` (Zeile 536-539) wird `durationInFrames` berechnet als:
```
(contentConfig?.voiceoverDuration || scenes.reduce(...)) * 30
```
Die `voiceoverDuration` aus der API-Response (`data.duration`) ist oft falsch/kurz. Die Audio-Metadaten-Korrektur in `ContentVoiceStep.tsx` (Zeile 198-219) aktualisiert den Wert zwar korrekt, aber der `useEffect` dort hat `value` als Dependency, was zu Endlosschleifen oder Race Conditions fuehren kann. Ausserdem: wenn Szenen existieren aber keine Voiceover, wird `scenes.reduce()` verwendet — die Szenen-Dauer ist aber oft nur 1-5s pro Szene und stimmt nicht mit der tatsaechlichen Video-Laenge ueberein.

**Problem 2 — Render schlaegt fehl (durationInFrames Mismatch):**
In `render-with-remotion` (Zeile 296-304) berechnet die Edge Function `totalDurationSeconds` **nur aus den Szenen**, ignoriert aber `voiceoverDuration` komplett. Wenn die Szenen z.B. 4s total dauern, aber das Voiceover 27s lang ist, schickt Lambda `durationInFrames=120` (4s*30fps), waehrend die Remotion-Composition intern `durationInFrames=810` (27s*30fps) erwartet.

### Aenderungen

#### 1. `src/pages/UniversalCreator/UniversalCreator.tsx` — Korrekte Duration fuer Preview
- `durationInFrames`-Berechnung (Zeile 536-539) aendern: `Math.max()` aus Voiceover-Dauer UND Szenen-Dauer nehmen, damit immer der laengere Wert gewinnt
- `actualVoiceoverDuration` bevorzugen falls vorhanden (ist die korrigierte Dauer aus Audio-Metadaten)

```
durationInFrames={Math.ceil(
  Math.max(
    contentConfig?.actualVoiceoverDuration || contentConfig?.voiceoverDuration || 0,
    scenes.reduce((sum, s) => sum + s.duration, 0)
  ) * 30
) || 150}
```

#### 2. `src/components/universal-creator/steps/ContentVoiceStep.tsx` — Audio-Duration Fix
- Zeile 219: `value` aus den Dependencies entfernen (verursacht Endlosschleifen-Risiko)
- Stattdessen nur `value?.voiceoverUrl` als Trigger verwenden
- `onChange` stabil machen: nur aufrufen wenn `actualVoiceoverDuration` sich tatsaechlich aendert

#### 3. `supabase/functions/render-with-remotion/index.ts` — Duration korrekt berechnen
- Zeile 296-304: `totalDurationSeconds` muss das **Maximum** aus Szenen-Dauer und `voiceoverDuration` sein
- Aenderung:
```
const sceneDuration = Array.isArray(sanitizedCustomizations.scenes) 
  ? sanitizedCustomizations.scenes.reduce((sum, s) => sum + Number(s.duration || 0), 0)
  : 0;
const totalDurationSeconds = Math.max(sceneDuration, voiceoverDuration, 5);
```
- So bekommt Lambda immer die korrekte `durationInFrames` die zur tatsaechlichen Video-Laenge passt

#### 4. `src/components/universal-creator/steps/PreviewExportStep.tsx` — Gleiche Logik im Export
- Zeile 289-290: `calculatedDuration` ebenfalls als `Math.max()` aus Voiceover und Szenen berechnen (ist teilweise schon so, aber Fallback auf 30 entfernen und durch echte Berechnung ersetzen)

### Dateien
1. `src/pages/UniversalCreator/UniversalCreator.tsx` — Preview durationInFrames + voiceoverDuration Prop
2. `src/components/universal-creator/steps/ContentVoiceStep.tsx` — useEffect Dependency-Fix
3. `supabase/functions/render-with-remotion/index.ts` — totalDurationSeconds = max(scenes, voiceover)
4. `src/components/universal-creator/steps/PreviewExportStep.tsx` — calculatedDuration konsistent

