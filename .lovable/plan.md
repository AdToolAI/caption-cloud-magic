
# Fix: Lambda-Rendering schlaegt fehl -- Zweiteilige Loesung

## Problem-Analyse

Die Lambda wird im Event-Modus (fire-and-forget) aufgerufen. Das bedeutet:

1. **Kein Fehler-Feedback**: Wenn die Lambda abstuerzt, erfahren wir das NIE (kein Response Body bei HTTP 202)
2. **progress.json unauffindbar**: Die Lambda generiert intern eine eigene `renderId`. Die `progress.json` liegt unter `renders/{INTERNE_RENDER_ID}/progress.json`. Wir suchen aber unter `renders/{pendingRenderId}/progress.json` -- die existiert nie.
3. **Webhook kommt nicht**: Die Webhook-Logs sind leer -- die Lambda crashed wahrscheinlich bevor sie den Webhook ausloesen kann.
4. **Alle 5 letzten Renders**: Status `rendering` in der DB, keines jemals `completed`. Das beweist: die Lambda liefert nie ein fertiges Video.

Der Director's Cut verwendet `RequestResponse`-Modus und funktioniert, weil die Lambda dort sofort `{ renderId, bucketName }` zurueckgibt (das Rendering laeuft async auf Sub-Lambdas weiter). Die Antwort kommt in 2-5 Sekunden.

**Warum RequestResponse vorher gescheitert ist**: Es war im SELBEN Edge Function, der schon 2+ Minuten fuer die Pipeline gelaufen war. Die Gesamtzeit hat den `wall_clock`-Timeout ueberschritten.

## Loesung: Lambda-Aufruf in separate Edge Function auslagern

Neue Edge Function `invoke-remotion-render` erstellen, die NUR die Lambda aufruft -- identisch zum Director's Cut Pattern:

### Neue Datei: `supabase/functions/invoke-remotion-render/index.ts`

- Nimmt `lambdaPayload`, `pendingRenderId`, `userId`, `progressId` entgegen
- Ruft Lambda im **RequestResponse**-Modus auf (wie Director's Cut)
- Bekommt sofort `{ renderId, bucketName }` zurueck (2-5 Sekunden)
- Aktualisiert `video_renders` mit der echten `renderId`
- Aktualisiert `universal_video_progress` mit der echten `renderId`
- Gibt Erfolg/Fehler zurueck

Diese Funktion hat ein frisches wall_clock-Budget (sie startet bei 0 Sekunden), daher kein Timeout-Problem.

### Aenderung: `supabase/functions/auto-generate-universal-video/index.ts`

Statt Lambda direkt aufzurufen, ruft die Pipeline-Funktion die neue `invoke-remotion-render` Edge Function auf:

```text
Vorher: auto-generate-universal-video --[Event mode]--> AWS Lambda (blind, kein Feedback)
Nachher: auto-generate-universal-video --[HTTP POST]--> invoke-remotion-render --[RequestResponse]--> AWS Lambda (sofort Feedback)
```

Der HTTP-Call an `invoke-remotion-render` dauert nur 5-10 Sekunden (Lambda-Start + Antwort), weit unter dem ~120s Gateway-Timeout fuer Edge-to-Edge-Calls.

### Aenderung: `supabase/config.toml`

```toml
[functions.invoke-remotion-render]
verify_jwt = false
```

### Warum das funktioniert

1. **Frisches Timeout-Budget**: Die neue Funktion startet bei 0s wall_clock, hat volle Laufzeit
2. **Echte renderId**: `check-remotion-progress` kann die korrekte `progress.json` auf S3 finden
3. **Sofortiges Fehler-Feedback**: Wenn die Lambda die Composition nicht findet oder abstuerzt, sehen wir den Fehler sofort
4. **Bewiesenes Pattern**: Director's Cut funktioniert exakt so

### Was sich fuer den Nutzer aendert

- Echte Fortschrittsverfolgung statt geschaetzter 92%-Obergrenze
- Sofortige Fehlermeldung bei Lambda-Problemen (statt 8 Minuten warten)
- Video-Completion wird zuverlaessig erkannt

### Dateien die geaendert werden

1. **NEU**: `supabase/functions/invoke-remotion-render/index.ts` -- Dedizierte Lambda-Aufruf-Funktion
2. **EDIT**: `supabase/functions/auto-generate-universal-video/index.ts` -- Lambda-Aufruf durch HTTP-Call an neue Funktion ersetzen
3. **EDIT**: `supabase/config.toml` -- JWT-Konfiguration fuer neue Funktion (wird automatisch aktualisiert)
