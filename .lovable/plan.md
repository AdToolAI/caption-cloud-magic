

# Fix: Zwei kritische Konfigurationsfehler gefunden

## Was ich definitiv gefunden habe

Nach erneuter Analyse habe ich **zwei konkrete, behebbare Fehler** identifiziert, die zusammen das Problem verursachen:

### Fehler 1: `invoke-remotion-render` fehlt komplett in `config.toml`

Die Funktion hat **keinen Eintrag** in `supabase/config.toml`. Das bedeutet:
- Supabase verwendet den **Standard-Timeout** (ca. 30 Sekunden)
- Die Funktion wird vom System gekillt, bevor Lambda ueberhaupt antworten kann
- Zum Vergleich: `render-directors-cut` (das funktioniert!) hat einen Eintrag

### Fehler 2: Kuenstlicher 50s AbortController-Timeout

In `invoke-remotion-render/index.ts` (Zeile 26) steht:
```text
const REQUEST_RESPONSE_TIMEOUT_MS = 50_000; // 50 Sekunden
```

Dieser Timeout bricht die RequestResponse-Anfrage ab, bevor Lambda antworten kann. Danach wird Event-Modus verwendet, aber die Funktion wird durch Fehler 1 auch dort zu frueh gekillt.

**Der Director's Cut hat keinen solchen Timeout** -- er wartet einfach auf die Lambda-Antwort und funktioniert deshalb.

## Beweis aus den Logs

```text
tracking_mode = event_fallback_timeout  (IMMER timeout!)
real_id = null                          (IMMER null!)
```

Jeder einzelne Render landet im `event_fallback_timeout` -- weil der 50s-Timeout IMMER zuschlaegt (Lambda braucht 60-120s fuer den Start-Handshake).

## Loesung (2 Aenderungen)

### 1. Config-Eintrag hinzufuegen
**Datei:** `supabase/config.toml`

Neuen Block hinzufuegen:
```text
[functions.invoke-remotion-render]
verify_jwt = false
timeout_sec = 300
```

`verify_jwt = false` weil die Funktion bereits intern die Authentifizierung prueft (Service-Role-Key).

### 2. AbortController-Timeout entfernen
**Datei:** `supabase/functions/invoke-remotion-render/index.ts`

Den kuenstlichen 50s-Timeout entfernen und die Lambda-Anfrage direkt absetzen -- genau wie `render-directors-cut` es macht. Der Edge-Function-Timeout von 300s ist der natuerliche Schutz.

Konkret:
- Zeile 26: `REQUEST_RESPONSE_TIMEOUT_MS` entfernen
- Zeilen 168-169: `AbortController` und `setTimeout` entfernen
- Zeile 179: `signal: controller.signal` entfernen
- Zeile 181: `clearTimeout` entfernen

Das Lambda-Invocation sieht danach so aus wie beim Director's Cut:
```text
const lambdaResponse = await aws.fetch(lambdaUrl, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: asciiSafeJson,
});
```

## Warum das diesmal der echte Fix ist

- **Director's Cut funktioniert** mit exakt diesem Muster (kein Timeout, RequestResponse, 300s Edge-Timeout)
- **Universal Video scheitert** weil es einen 50s-Timeout hat UND keinen config.toml-Eintrag
- Es ist keine Tracking/Reconciliation/Version-Frage -- die Lambda-Antwort kommt einfach nie an

## Dateien die geaendert werden

1. `supabase/config.toml` -- Eintrag fuer invoke-remotion-render hinzufuegen
2. `supabase/functions/invoke-remotion-render/index.ts` -- AbortController-Timeout entfernen

## Erwartetes Ergebnis

Nach diesen zwei Aenderungen:
- RequestResponse wartet bis zu 300s auf Lambda-Antwort
- `real_remotion_render_id` wird sofort aus der Antwort gespeichert
- `check-remotion-progress` kann den echten Render ueber `progress.json` tracken
- Kein Fallback auf Event-Modus mehr noetig
