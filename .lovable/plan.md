
# Fix: Build-Fehler + Rendering-Timeout beheben

## Problem 1: Build-Fehler (bun.lock)

Die `bun.lock` Datei hat eine interne Workspace-Referenz fuer `mux-embed` die nicht aufgeloest werden kann. Das Hinzufuegen von `mux-embed` zu `package.json` hat nicht geholfen, weil `bun.lock` die alte Workspace-Aufloesung cached.

**Loesung:** `bun.lock` komplett loeschen. Die Datei wird beim naechsten Build sauber regeneriert.

---

## Problem 2: Rendering-Timeout bei 92%

### Ursache (aus den Logs)

Die Edge Function `auto-generate-universal-video` ruft AWS Lambda im **synchronen** `RequestResponse`-Modus auf. Das bedeutet, die Funktion wartet auf die Lambda-Antwort. Da das Rendering aber 3-5 Minuten dauert, wird die Edge Function vorher vom Supabase `wall_clock`-Limit (~255 Sekunden) getoetet:

```text
18:30:53 - Lambda invoked (RequestResponse)
18:31:50 - Function shutdown: early_drop
18:34:30 - Function shutdown: wall_clock
           --> Lambda-Antwort NIEMALS empfangen
           --> Kein Output auf S3
           --> Alle Polls: 404
           --> 8-Minuten Client-Timeout
```

### Loesung

Den Lambda-Aufruf von `RequestResponse` (synchron) auf `Event` (fire-and-forget) umstellen. Die Lambda laeuft dann unabhaengig von der Edge Function weiter und schreibt das Ergebnis nach S3. Der Webhook und das S3-Polling erkennen die Completion.

---

## Technische Aenderungen

| Datei | Aenderung |
|-------|-----------|
| `bun.lock` | Loeschen |
| `package.json` | `mux-embed` aus dependencies entfernen (nicht direkt gebraucht) |
| `supabase/functions/auto-generate-universal-video/index.ts` | Lambda-Aufruf von `RequestResponse` auf `Event` umstellen. Retry-Logik anpassen (bei Event-Modus gibt Lambda sofort 202 zurueck, kein Response-Body-Parsing noetig). Nach erfolgreichem Aufruf sofort mit Status `rendering` antworten. |

### Detail: Lambda Invocation Aenderung

Zeile 581 aendern:
- Vorher: `'X-Amz-Invocation-Type': 'RequestResponse'`
- Nachher: `'X-Amz-Invocation-Type': 'Event'`

Die nachfolgende Response-Parsing-Logik (Zeilen 589-644) wird vereinfacht:
- Bei `Event`-Modus gibt Lambda HTTP 202 zurueck (accepted), kein Body
- Erfolg = Status 202
- Fehler = Status != 202
- Kein JSON-Parsing des Response-Body noetig
- `renderId` bleibt der vorher generierte `pendingRenderId` (Lambda gibt bei Event keinen zurueck)

### Warum das funktioniert

1. Lambda wird gestartet und laeuft unabhaengig (fire-and-forget)
2. Edge Function kann sofort beenden (kein wall_clock Problem)
3. Lambda schreibt Output nach S3 als `universal-video-{renderId}.mp4`
4. Webhook meldet Completion an `remotion-webhook` Endpoint
5. Client-side S3-Polling erkennt die Datei und zeigt das Video

---

## Reihenfolge

1. `bun.lock` loeschen und `mux-embed` aus `package.json` entfernen
2. Lambda-Invocation in `auto-generate-universal-video` auf Event-Modus umstellen
3. Edge Function deployen
4. Testen
