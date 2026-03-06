

## r36 — Audio-Corruption Retry fehlt im Render-Polling-Pfad

### Befund

Es gibt **zwei** Stellen im Frontend, die Render-Only-Retries auslösen:

1. **Zeile 328** (Progress-Polling, Phase 1): ✅ Enthält `audio_corruption`
2. **Zeile 593** (Render-Polling, Phase 2): ❌ Fehlt `audio_corruption`

Der ffprobe-Crash tritt während des **aktiven Renderings** auf (Phase 2), wird also nur im Render-Polling erkannt. Dort fehlt aber `audio_corruption` in der if-Bedingung → kein Retry, direkt Fehleranzeige.

### Fix

**Datei:** `src/components/universal-video-creator/UniversalAutoGenerationProgress.tsx`

**Zeile 593:** `audio_corruption` zur Retry-Bedingung hinzufügen:
```typescript
if ((effectiveCategory === 'rate_limit' || effectiveCategory === 'timeout' || effectiveCategory === 'lambda_crash' || effectiveCategory === 'audio_corruption') && !retryTriggeredRef.current) {
```

Außerdem den Wait-Timer und Label analog zu Zeile 336-341 anpassen:
- `audio_corruption` → 5s Wait, Label "Audio-Fehler"

### Erwartetes Ergebnis
```
ffprobe-Crash während Rendering → audio_corruption erkannt → 5s warten → 
Render-Only Retry mit Audio-Strip → Video ohne Ton erfolgreich ✅
```

### Dateien
1. `src/components/universal-video-creator/UniversalAutoGenerationProgress.tsx` — Zeile 593 + Wait/Label-Logik

