
# Fix: S3-Pfad, Retry-Button und Format-Erkennung

## Problem 1: Video wird nie auf S3 gefunden (Hauptursache fuer 92%-Haenger)

Die Logs zeigen klar: Sowohl `out.mp4` als auch `progress.json` sind auf S3 immer 404.

**Ursache**: `outName: "pending-xxx/out.mp4"` speichert das Video unter `s3://bucket/pending-xxx/out.mp4`. Aber `check-remotion-progress` sucht unter `s3://bucket/renders/pending-xxx/out.mp4` (mit `renders/`-Prefix in Zeile 178). Der Pfad stimmt nicht ueberein.

Ausserdem: `progress.json` wird von Lambda unter seinem internen Render-ID-Ordner geschrieben (z.B. `renders/abc123-internal/progress.json`), NICHT unter `renders/pending-xxx/progress.json`. Deshalb ist auch der Fortschritt immer nur "time-based" und nie real.

**Loesung**: `outName` im Lambda-Payload auf `renders/${pendingRenderId}/out.mp4` setzen (mit `renders/`-Prefix). So landet das fertige Video genau dort, wo `check-remotion-progress` sucht.

### Datei: `supabase/functions/auto-generate-universal-video/index.ts`

Zeile 540 aendern:
```text
// Vorher:
outName: `${pendingRenderId}/out.mp4`,

// Nachher:
outName: `renders/${pendingRenderId}/out.mp4`,
```

## Problem 2: "Erneut versuchen" Button reagiert nicht

Es gibt ZWEI verschiedene Retry-Buttons:
- **Button A** (Zeile 577-588 in `UniversalAutoGenerationProgress.tsx`): Sichtbar innerhalb der Progress-Komponente wenn ein Fehler auftritt. Ruft `startAutoGeneration()` direkt auf.
- **Button B** (Zeile 442 in `UniversalVideoWizard.tsx`): Sichtbar in der Recovery-UI, aber NUR wenn `!isAutoGenerating`. Wird nie angezeigt, weil `isAutoGenerating` im Parent `true` bleibt.

Der Screenshot zeigt die Recovery-UI des Wizards (Button B). Das bedeutet, der Wizard wechselt irgendwann zu `!isAutoGenerating` (vermutlich durch einen anderen Code-Pfad). Aber `handleRetry` setzt zwar `isAutoGenerating = true` und `retryCount + 1`, die Komponente wird aber moeglicherweise nicht korrekt re-mounted weil die Bedingung `currentStepId === 'generating' && isAutoGenerating` kurzzeitig false ist und React die Komponente unmountet und dann wieder mounted - was gut waere. Aber es scheint nicht zu funktionieren.

**Loesung**: Den Retry im Wizard robuster machen. Statt nur State zu setzen, einen kleinen Timeout einbauen damit React die Komponente erst vollstaendig unmountet (isAutoGenerating = false), dann im naechsten Tick wieder mounted (isAutoGenerating = true):

### Datei: `src/components/universal-video-creator/UniversalVideoWizard.tsx`

```text
const handleRetry = () => {
  setError(null);
  setIsAutoGenerating(false);  // Unmount zuerst
  setRetryCount(prev => prev + 1);
  
  // Re-mount im naechsten Tick
  setTimeout(() => {
    if (consultationResult && generationMode === 'full-service') {
      setIsAutoGenerating(true);
      setCurrentStep(3);
    }
  }, 100);
};
```

Zusaetzlich den internen Retry-Button in der Progress-Komponente (Zeile 577-588) so aendern, dass er den Fehler-State nach oben propagiert und den Parent-Retry ausloest, statt intern `startAutoGeneration()` aufzurufen. Dazu `onRetry` als neuen Prop hinzufuegen.

### Datei: `src/components/universal-video-creator/UniversalAutoGenerationProgress.tsx`

- Neuen Prop `onRetry` hinzufuegen
- Den internen "Erneut versuchen" Button so aendern, dass er `onRetry()` aufruft statt `startAutoGeneration()`
- So wird der Retry immer ueber den Wizard abgewickelt, was ein sauberes Re-Mount garantiert

## Problem 3: Format zeigt immer 16:9

Die `consultationResult`-Daten werden vom Consultant ueber `extractRecommendation` erzeugt. Die Felder `aspectRatio`, `format` und `outputFormats` muessen geprueft werden. Moeglicherweise wird das Objekt bei der Uebergabe von der Consultant-Komponente zum Wizard transformiert und dabei gehen Felder verloren.

### Datei: `src/components/universal-video-creator/UniversalAutoGenerationProgress.tsx`

Die Fallback-Logik erweitern und zusaetzlich in den verschachtelten `recommendation`-Feldern suchen:

```text
const selectedAspectRatio = consultationResult?.aspectRatio 
  || consultationResult?.format
  || consultationResult?.outputFormats?.[0]
  || consultationResult?.recommendation?.aspectRatio
  || consultationResult?.recommendation?.format
  || '16:9';
```

Und ein `console.log` hinzufuegen um im naechsten Run zu sehen, welche Daten ankommen:

```text
console.log('[UniversalAutoGen] consultationResult keys:', Object.keys(consultationResult || {}));
console.log('[UniversalAutoGen] aspectRatio:', consultationResult?.aspectRatio, 'format:', (consultationResult as any)?.format);
```

---

## Zusammenfassung

| Datei | Aenderung |
|-------|-----------|
| `auto-generate-universal-video/index.ts` | `outName` auf `renders/${pendingRenderId}/out.mp4` aendern (mit `renders/`-Prefix) |
| `UniversalVideoWizard.tsx` | `handleRetry`: erst unmounten (`isAutoGenerating = false`), dann per Timeout re-mounten |
| `UniversalAutoGenerationProgress.tsx` | `onRetry`-Prop hinzufuegen, internen Retry-Button delegieren, Format-Fallback erweitern mit Debug-Logging |

## Erwartetes Ergebnis

- Lambda-Output landet unter `renders/pending-xxx/out.mp4` - genau wo `check-remotion-progress` sucht
- S3-Polling erkennt Completion und zeigt 100%
- "Erneut versuchen" unmountet die Komponente und startet eine frische Generierung
- Debug-Logs zeigen welche Format-Daten ankommen, um das 16:9-Problem endgueltig zu fixen
