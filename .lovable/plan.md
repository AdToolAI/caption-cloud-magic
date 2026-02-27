

## Fehler: "Both 'framesPerLambda' and 'concurrency' were set"

Der vorherige "Version mismatch"-Fehler ist behoben -- die Payload-Normalisierung funktioniert. Jetzt lehnt Remotion den Payload ab, weil zwei sich gegenseitig ausschliessende Felder gleichzeitig gesetzt sind.

## Ursache

Der Payload-Normalizer (`_shared/remotion-payload.ts`) setzt **immer** `concurrencyPerLambda: 1` als Default. Gleichzeitig uebergeben die Caller (`auto-generate-universal-video`, `render-directors-cut`) `framesPerLambda: 150`. Remotion v4.0.424 erlaubt nur **eines** von beiden.

## Fix

Eine einzige Aenderung in `supabase/functions/_shared/remotion-payload.ts`:

- Wenn der Caller `framesPerLambda` setzt (nicht null), wird `concurrencyPerLambda` auf `undefined`/entfernt
- Wenn keines gesetzt ist, wird `framesPerLambda: null` beibehalten und `concurrencyPerLambda: 1` als Default verwendet
- Nach der Normalisierung: explizit pruefen und eines der beiden entfernen, falls beide vorhanden

### Technisch

In der `normalizeStartPayload`-Funktion nach Zeile 117 eine Bereinigung einfuegen:

```text
// Remotion v4 does NOT allow both — pick one
if (normalized.framesPerLambda != null) {
  delete (normalized as any).concurrencyPerLambda;
} else {
  delete (normalized as any).framesPerLambda;
}
```

Keine weiteren Dateien betroffen. Die Caller bleiben unveraendert.
