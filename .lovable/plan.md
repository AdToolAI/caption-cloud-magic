

# Fix: Universal Creator Lambda Invocation und Build-Fehler

## Zusammenfassung

Es gibt zwei miteinander zusammenhaengende Probleme:

1. **Lambda Event-Modus verschluckt Fehler**: Die Lambda wird aufgerufen (202 Accepted), aber crasht sofort und unsichtbar. Kein progress.json, kein Output, kein Webhook.
2. **Lokaler Build kaputt (mux-embed)**: Der Nutzer kann das Remotion-Bundle nicht neu deployen, weil `bun install` fehlschlaegt.

## Root Cause Analyse

| Aspekt | Director's Cut (funktioniert) | Universal Creator (crasht) |
|--------|-------------------------------|----------------------------|
| Invocation Mode | RequestResponse (synchron) | Event (async, fire-and-forget) |
| Fehler-Feedback | Ja - Error wird zurueckgegeben | Nein - 202 und Stille |
| Lambda Response | `{ renderId, bucketName }` | Nur HTTP 202 |

Die Lambda akzeptiert den Request (202), crasht dann aber sofort. Wahrscheinlichste Ursache: Das REMOTION_SERVE_URL Bundle enthält die `UniversalCreatorVideo` Composition nicht, weil es vor dem Hinzufügen dieser Composition deployed wurde.

## Loesung: 2 Schritte

### Schritt 1: Lambda auf RequestResponse Modus umstellen

**Datei:** `supabase/functions/auto-generate-universal-video/index.ts`

Die Lambda-Invocation wird von `Event` (fire-and-forget) auf `RequestResponse` (synchron) umgestellt -- genau wie bei Director's Cut. Dadurch werden Lambda-Fehler sofort sichtbar und koennen behandelt werden.

Aenderungen:
- `X-Amz-Invocation-Type` von `'Event'` auf `'RequestResponse'` aendern
- Response parsen und auf `errorMessage`/`errorType` pruefen (wie in Director's Cut `invokeRemotionLambda`)
- Bei Fehler: Credits erstatten, Status auf `failed` setzen, Fehlermeldung in Progress schreiben
- Bei Erfolg: `renderId` und `bucketName` aus der Lambda-Response extrahieren und in DB speichern
- Retry-Logik mit 3 Versuchen und exponential backoff hinzufuegen (wie Director's Cut)

### Schritt 2: bun.lock loeschen (mux-embed Build-Fehler)

**Datei:** `bun.lock`

Die `bun.lock` Datei enthaelt veraltete Referenzen zu `mux-embed` als Workspace-Dependency. Datei loeschen, damit sie beim naechsten `bun install` sauber regeneriert wird.

## Technische Details

### Lambda Invocation (vorher vs nachher)

Vorher (Event mode - Fehler unsichtbar):
```text
POST /invocations
X-Amz-Invocation-Type: Event
-> 202 Accepted (keine Fehler-Info)
```

Nachher (RequestResponse - wie Director's Cut):
```text
POST /invocations  
X-Amz-Invocation-Type: RequestResponse
-> 200 + { renderId, bucketName } bei Erfolg
-> 200 + { errorMessage, errorType } bei Fehler
```

### Retry-Logik bei AWS Concurrency Limits

Wie bei Director's Cut: 3 Versuche mit exponential backoff (5s, 10s, 20s). Bei Rate-Limit oder Throttling-Fehlern wird automatisch erneut versucht.

### Erwartetes Ergebnis

Wenn die Ursache tatsaechlich ein fehlendes Composition im Bundle ist, wird die Fehlermeldung jetzt sichtbar, z.B.:
`"Composition 'UniversalCreatorVideo' not found"`

Dann muss der Nutzer lokal das Remotion-Bundle neu deployen:
```bash
npx remotion lambda sites create src/remotion/index.ts --site-name=adtool-remotion-bundle --region=eu-central-1
```
und das REMOTION_SERVE_URL Secret mit der neuen URL aktualisieren.

### Dateien die geaendert werden

| Datei | Aenderung |
|-------|-----------|
| `supabase/functions/auto-generate-universal-video/index.ts` | Lambda Invocation auf RequestResponse umstellen, Retry-Logik, Error-Handling |
| `bun.lock` | Loeschen (wird beim naechsten install regeneriert) |

