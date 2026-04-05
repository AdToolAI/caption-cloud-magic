

## Umgesetzt: Deterministische Szenenanalyse (Pixel-basiert + KI-Verifikation)

### Problem
Die KI hat Szenen "geraten" statt echte Schnitte zu erkennen. Ein 60s-Video mit 2 Szenen à 30s wurde als 5 Szenen erkannt.

### Lösung (implementiert)

**1. Neuer Client-seitiger Cut-Detector: `src/lib/directors-cut-scene-detection.ts`**
- `extractTimestampedFrames()`: Frames gleichmäßig über die GESAMTE Videodauer verteilt (nicht nur erste 20s)
- `detectCutsAsync()`: Pixel-Differenz zwischen aufeinanderfolgenden Frames → adaptive Threshold-Erkennung
- `buildScenesFromCuts()`: Szenen aus erkannten Schnittzeiten erstellen

**2. Frontend: `src/pages/DirectorsCut/DirectorsCut.tsx`**
- Mock-Szenen-Fallback (3 Fake-Szenen im catch) ENTFERNT
- Frame-Extraktion nutzt jetzt `extractTimestampedFrames()` mit voller Videolänge
- Client-seitige Schnitterkennung VOR dem API-Aufruf
- Erkannte Schnitt-Zeitstempel werden als `detected_cuts` an die Edge Function gesendet
- Frames mit echten Zeitstempeln als `Array<{ time, image }>` statt `string[]`

**3. Edge Function: `supabase/functions/analyze-video-scenes/index.ts`**
- Akzeptiert `detected_cuts: number[]` und `frames: Array<{ time, image }>`
- KI-Prompt: "Bestätige oder verwerfe die vorab erkannten Schnitte"
- Kein "Rate die Szenenzahl" mehr — KI verifiziert nur noch
- Fallback bei API-Fehler: Client-Cuts verwenden oder 1 Szene
- `generateFallbackScenes()` → `generateSingleScene()` (immer 1 Szene)
- `temperature` von 0.4 auf 0.2 gesenkt für konsistentere Ergebnisse

### Ergebnis
- 60s Video mit Cut bei 30s → exakt 2 Szenen
- 60s Video ohne Cut → exakt 1 Szene
- Analyse-Fehler → keine Fake-Szenen, stattdessen Fehlermeldung
