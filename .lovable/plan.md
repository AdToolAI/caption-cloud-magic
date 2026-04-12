

## Fix: Kling 3.0 Modell-Anzeige in der Video-Historie

### Problem
In `src/components/ai-video/VideoGenerationHistory.tsx` Zeile 265 ist die Modell-Anzeige hardcoded:
```typescript
{gen.model === 'sora-2-pro' ? 'Sora 2 Pro' : 'Sora 2 Standard'}
```
Alle Videos — auch Kling-Generierungen — werden als "Sora 2 Standard" angezeigt.

### Lösung
Die Zeile durch eine Map ersetzen, die alle Modelle korrekt auflöst:

```typescript
const MODEL_DISPLAY_NAMES: Record<string, string> = {
  'sora-2-standard': 'Sora 2 Standard',
  'sora-2-pro': 'Sora 2 Pro',
  'kling-3-standard': 'Kling 3.0 Standard',
  'kling-3-pro': 'Kling 3.0 Pro',
};

// In der Anzeige:
{MODEL_DISPLAY_NAMES[gen.model] || gen.model}
```

### Datei
- `src/components/ai-video/VideoGenerationHistory.tsx` — eine Zeile anpassen + Map hinzufügen

