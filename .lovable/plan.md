

## Fix: "Cannot read properties of undefined (reading 'split')" im Export-Schritt

### Problem
In `src/components/universal-creator/steps/PreviewExportStep.tsx` Zeile 663 wird `contentConfig.scriptText.split(...)` aufgerufen, ohne zu prüfen ob `scriptText` existiert. Wenn kein Script-Text vorhanden ist, ist der Wert `undefined` und `.split()` crasht.

### Lösung

**Datei: `src/components/universal-creator/steps/PreviewExportStep.tsx`**
- Zeile 663: Optional Chaining hinzufügen: `contentConfig.scriptText?.split(...)` mit Fallback `?? 0`

```typescript
// Vorher:
{contentConfig.scriptText.split(/\s+/).filter(Boolean).length} Wörter

// Nachher:
{contentConfig.scriptText?.split(/\s+/).filter(Boolean).length ?? 0} Wörter
```

Eine einzige Zeile — damit ist der Crash behoben.

