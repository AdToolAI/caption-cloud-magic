

## Fix: Bearbeitete Untertitel erscheinen nicht im Preview

### Ursache

In `SubtitleTimingStep.tsx` Zeile 85 wird beim Speichern nur `text` aktualisiert:
```typescript
{ ...seg, text: editText, startTime: editStartTime, endTime: editEndTime }
```

Das `words`-Array bleibt unverändert mit dem alten Text. Das Remotion-Template (`UniversalVideo.tsx`) rendert aber bevorzugt aus `words` (Zeile 793-818) — `text` ist nur Fallback wenn `words` leer ist.

### Änderungen

#### 1. `src/components/universal-creator/steps/SubtitleTimingStep.tsx`

In `handleSaveEdit`: Nach dem Text-Update das `words`-Array neu aufbauen. Neuen Text in Wörter splitten, Timings gleichmässig zwischen `startTime` und `endTime` verteilen:

```typescript
const newWords = editText.split(/\s+/).filter(Boolean).map((word, i, arr) => {
  const duration = (editEndTime - editStartTime) / arr.length;
  return {
    text: word,
    startTime: editStartTime + i * duration,
    endTime: editStartTime + (i + 1) * duration,
  };
});

return { ...seg, text: editText, words: newWords, startTime: editStartTime, endTime: editEndTime };
```

#### 2. `src/remotion/templates/UniversalVideo.tsx`

Defensive Normalisierung: Vor dem Rendern prüfen ob `words` zum `text` passt. Wenn nicht (z.B. alte Daten), `words` aus `text` ableiten. Dies sichert auch bestehende Projekte ab.

### Dateien
1. `src/components/universal-creator/steps/SubtitleTimingStep.tsx` — `words` beim Speichern mitsynchronisieren
2. `src/remotion/templates/UniversalVideo.tsx` — Fallback-Normalisierung wenn `words` und `text` divergieren

