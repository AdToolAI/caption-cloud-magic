

## Fix: Scheduling Guard prueft falsches Feld

### Ursache

Der Guard in `invoke-remotion-render/index.ts` (Zeilen 108-119) prueft:

```text
hasConcurrency = concurrencyPerLambda != null  OR  concurrency != null
```

Da wir `concurrencyPerLambda = 1` setzen (notwendig fuer Task-Verteilung) UND `framesPerLambda` gesetzt ist, feuert der Guard und gibt HTTP 400 zurueck.

Das ist falsch, denn:
- `concurrency` = Anzahl Lambda-Invocations (kollidiert mit framesPerLambda)
- `concurrencyPerLambda` = Browser-Tabs pro Lambda (kollidiert NICHT)

### Aenderung

**Datei: `supabase/functions/invoke-remotion-render/index.ts`**

Zeilen 108-110: `concurrencyPerLambda` aus der Guard-Pruefung entfernen. Nur `concurrency` (nicht null) ist ein echter Konflikt:

```text
Vorher:
  const hasConcurrency = ('concurrencyPerLambda' in normalizedPayload && normalizedPayload.concurrencyPerLambda != null)
    || ('concurrency' in normalizedPayload && (normalizedPayload as any).concurrency != null);

Nachher:
  const hasConcurrency = 'concurrency' in normalizedPayload && (normalizedPayload as any).concurrency != null;
```

Ein-Zeilen-Aenderung. Keine weiteren Dateien betroffen.

### Warum das funktioniert

- `concurrency` ist auf `null` gesetzt (korrekt), daher `hasConcurrency = false`
- `framesPerLambda` ist gesetzt, daher `hasFramesPerLambda = true`
- Der Guard feuert nicht mehr (`false && true = false`)
- `concurrencyPerLambda = 1` bleibt erhalten fuer die interne Task-Verteilung

### Zusammenfassung der 3 Scheduling-Felder

| Feld | Wert | Zweck |
|------|------|-------|
| framesPerLambda | berechnet (z.B. 24) | Frames pro Lambda-Invocation |
| concurrency | null | Explizit deaktiviert (kein Konflikt) |
| concurrencyPerLambda | 1 | Browser-Tabs pro Lambda (kein Konflikt) |

