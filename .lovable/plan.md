

# Fix: Lambda direkt aufrufen mit Event-Modus (kein Zwischenschritt mehr)

## Das eigentliche Problem

Alle bisherigen Versuche scheitern an derselben Ursache: **Die Supabase API Gateway hat ein hartes, nicht konfigurierbares ~120s Timeout fuer Edge-zu-Edge HTTP-Aufrufe.** Egal ob `await`, fire-and-forget, oder `EdgeRuntime.waitUntil()` - der `fetch()` zu `invoke-remotion-render` geht durch die API Gateway, die nach 120s die Verbindung kappt. `invoke-remotion-render` wird entweder nie erreicht oder stirbt mittendrin.

**Beweis:** Es gibt NULL Logs fuer `invoke-remotion-render` bei den letzten Versuchen - die Funktion wird vom Gateway gekillt bevor sie antworten kann, oder der Request kommt gar nicht an.

## Die Loesung: Lambda direkt aufrufen, kein Umweg

`auto-generate-universal-video` hat bereits `AwsClient` importiert und AWS Credentials konfiguriert (Zeilen 3, 6-8, 35-39). Statt den Umweg ueber eine zweite Edge Function zu nehmen, rufen wir AWS Lambda **direkt** auf - mit `Event` statt `RequestResponse` Modus.

**Event-Modus bedeutet:** AWS gibt sofort (in <1 Sekunde) einen HTTP 202 zurueck. Lambda laeuft asynchron weiter. Das Ergebnis kommt ueber den bereits konfigurierten Webhook (`remotion-webhook`).

```text
Vorher (kaputt):
  auto-generate -> fetch -> API Gateway (120s limit) -> invoke-remotion-render -> Lambda (3+ min)
                                    ^^ HIER STIRBT ES

Nachher (fix):
  auto-generate -> AWS Lambda API direkt (Event-Modus, <1s Antwort)
                   Lambda laeuft async -> Webhook meldet Ergebnis
```

## Aenderungen

### Datei: `supabase/functions/auto-generate-universal-video/index.ts`

Zeilen 561-590 ersetzen. Statt des `fetch()` zu `invoke-remotion-render`:

```typescript
// Direkt Lambda aufrufen im Event-Modus (async, sofortige Antwort)
const aws = new AwsClient({
  accessKeyId: Deno.env.get('AWS_ACCESS_KEY_ID')!,
  secretAccessKey: Deno.env.get('AWS_SECRET_ACCESS_KEY')!,
  region: AWS_REGION,
});

const lambdaUrl = `https://lambda.${AWS_REGION}.amazonaws.com/2015-03-31/functions/${LAMBDA_FUNCTION_NAME}/invocations`;
const asciiSafePayload = toAsciiSafeJson(JSON.stringify(lambdaPayload));

console.log('Invoking Lambda in Event mode (async, returns immediately)...');
const lambdaResponse = await aws.fetch(lambdaUrl, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Amz-Invocation-Type': 'Event',   // <-- Sofortige Antwort, kein Warten
  },
  body: asciiSafePayload,
});

if (lambdaResponse.status !== 202) {
  const errorText = await lambdaResponse.text();
  console.error('Lambda Event invocation failed:', lambdaResponse.status, errorText);
  throw new Error(`Lambda-Start fehlgeschlagen: HTTP ${lambdaResponse.status}`);
}

console.log('Lambda Event invocation accepted (202). Webhook will handle completion.');
await updateProgress(supabase, progressId, 'rendering', 90, 'Video wird gerendert...');
```

### Warum das funktioniert

1. **Kein Edge-zu-Edge Aufruf** - geht direkt zu AWS, keine API Gateway dazwischen
2. **Event-Modus** - AWS antwortet in <1 Sekunde mit 202, kein Timeout moeglich
3. **Webhook bereits konfiguriert** - `remotion-webhook` empfaengt das Ergebnis und aktualisiert DB + Progress
4. **S3-Polling als Fallback** - `check-remotion-progress` findet das Video auf S3 auch ohne Webhook
5. `AwsClient` und `toAsciiSafeJson` sind bereits im Code vorhanden (Zeilen 3, 11-16)

### Was mit invoke-remotion-render passiert

Die Funktion wird nicht mehr fuer den Universal Creator benoetigt. Sie kann bestehen bleiben fuer andere Anwendungsfaelle, wird aber aus diesem Flow entfernt.

## Dateien die geaendert werden

1. **EDIT**: `supabase/functions/auto-generate-universal-video/index.ts` - Lambda direkt mit Event-Modus aufrufen statt fetch zu invoke-remotion-render

