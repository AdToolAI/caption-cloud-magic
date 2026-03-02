
## Fix: concurrencyPerLambda nicht loeschen

### Ursache (bestaetigt)
Der Scheduling-Fehler ("Both framesPerLambda and concurrency were set") ist geloest. Die Lambda-Invocation war erfolgreich (render ID `6867jca7gp`, Status 200). 

Der NEUE Fehler "Cannot read properties of undefined (reading 'length')" entsteht, weil wir `concurrencyPerLambda` aus dem Payload loeschen. Dieses Feld steuert die Anzahl paralleler Browser-Tabs **innerhalb** jeder Lambda-Invocation (Default: 1). Ohne dieses Feld kann Remotion intern kein Task-Array erstellen und crasht.

**Wichtig**: `concurrencyPerLambda` ist NICHT dasselbe wie `concurrency`:
- `concurrency` = Anzahl Lambda-Invocations (kollidiert mit framesPerLambda) -- korrekt auf `null` gesetzt
- `concurrencyPerLambda` = Browser-Tabs pro Lambda -- muss vorhanden sein (Default: 1)

### Aenderung

**Datei: `supabase/functions/_shared/remotion-payload.ts`**

Zeile 142 aendern:

```text
Vorher:  delete (normalized as any).concurrencyPerLambda;
Nachher: normalized.concurrencyPerLambda = (partial.concurrencyPerLambda as number) || 1;
```

Das ist eine Ein-Zeilen-Aenderung. Alles andere bleibt unveraendert:
- `framesPerLambda` bleibt explizit gesetzt (berechnet)
- `concurrency` bleibt explizit `null`
- `concurrencyPerLambda` wird auf `1` gesetzt (statt geloescht)

### Warum das funktioniert
- Remotion braucht `concurrencyPerLambda` um die Task-Verteilung innerhalb jeder Lambda zu berechnen
- Der Wert `1` ist der Default und bedeutet "ein Browser-Tab pro Lambda" (Standard-Verhalten)
- Es kollidiert NICHT mit `framesPerLambda` oder `concurrency`

### Keine weiteren Dateien betroffen
Die Aenderung ist nur in `_shared/remotion-payload.ts`. Alle Caller-Funktionen bleiben unveraendert.
