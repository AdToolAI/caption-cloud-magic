## Diagnose

Der generische Toast ist nur das Symptom. Die echten Logs zeigen den konkreten Fehler:

```text
render-dialog-stitch -> invoke-remotion-render -> AWS Lambda
Lambda HTTP 403: {"message":"The security token included in the request is invalid."}
```

**Do I know what the issue is?** Ja.

Der Lip-Sync selbst ist nicht mehr das Problem. Die einzelnen Sync.so-Turns sind fertig. Der Fehler passiert erst beim finalen Artlist-Schritt: `render-dialog-stitch` versucht den Remotion-Lambda-Render zu starten, aber AWS lehnt die Signatur ab.

Wahrscheinliche Ursache:
- Die gespeicherten AWS-Credentials sind abgelaufen, falsch rotiert oder nicht vollständig.
- Falls es temporäre AWS/STS-Credentials sind, fehlt zusätzlich `AWS_SESSION_TOKEN`. Externe Referenz bestätigt: temporäre AWS-Credentials brauchen Access Key, Secret Key und Session Token.
- Aktuell sind `AWS_ACCESS_KEY_ID` und `AWS_SECRET_ACCESS_KEY` vorhanden, aber kein `AWS_SESSION_TOKEN`.

## Ziel

Die Pipeline soll nicht mehr 13+ Minuten mit einem generischen Edge-Function-Fehler hängen bleiben, sondern:

```text
Sync.so-Turns fertig
        ↓
Stitch-Render Credential-Check
        ↓
bei gültigen AWS-Credentials: Lambda startet finalen DialogStitchVideo Render
bei ungültigen AWS-Credentials: sofort klarer Fehler + kein Retry-Spam
        ↓
aktuelle Szene nach Credential-Fix ohne neue Sync.so-Kosten retten
```

## Implementierungsplan

1. **AWS-Credential-Signing fixen**
   - In `invoke-remotion-render` wird `AWS_SESSION_TOKEN` optional unterstützt.
   - Wenn `AWS_SESSION_TOKEN` vorhanden ist, wird er an `AwsClient` übergeben.
   - Dadurch funktionieren auch temporäre AWS/STS-Credentials korrekt.

2. **Credential-Preflight einbauen**
   - Vor dem eigentlichen Lambda-Invoke prüft `invoke-remotion-render`, ob die benötigten AWS-Secrets sinnvoll vorhanden sind.
   - Bei fehlenden oder ungültigen Credentials wird ein strukturierter Fehler zurückgegeben, z. B. `aws_credentials_invalid`.
   - Der Fehler wird nicht mehr als normale `validation` klassifiziert.

3. **Retry-Spam stoppen**
   - `render-dialog-stitch` und `poll-dialog-shots` sollen AWS-403/Credential-Fehler als blockierten Infrastrukturzustand behandeln.
   - Das System soll nicht jede Minute denselben Stitch neu versuchen, solange die Credentials ungültig sind.
   - Szene bleibt rettbar, aber der Status wird eindeutig: `stitching_blocked_credentials` bzw. klarer `clip_error`.

4. **Bessere UI-/Toast-Meldung vorbereiten**
   - Der Frontend-Fehler soll nicht mehr nur `Edge Function returned a non-2xx status code` anzeigen.
   - Die vorhandene Fehlerextraktion wird genutzt/erweitert, damit der User sieht: finaler Render konnte wegen ungültiger Render-Credentials nicht gestartet werden.

5. **Aktuelle Szene retten**
   - Nach dem Credential-Fix wird die hängende Szene nicht komplett neu lip-synced.
   - Nur der finale Stitch wird erneut angestoßen, weil die Sync.so-Outputs bereits fertig sind.
   - Falls ein fehlgeschlagener `video_renders`-Eintrag existiert, wird der stale Stitch-Status bereinigt und erneut dispatcht.

6. **Absicherung dokumentieren**
   - Memory/Plan wird aktualisiert: Für Remotion-Lambda darf ein AWS-403 nicht als Sync.so- oder Dialogfehler behandelt werden.
   - Wichtig: Kein Refund oder erneuter Sync.so-Burn bei reinen Stitch-Credential-Problemen.

## Dateien, die ich im Build-Modus anfassen würde

- `supabase/functions/invoke-remotion-render/index.ts`
- `supabase/functions/render-dialog-stitch/index.ts`
- `supabase/functions/poll-dialog-shots/index.ts`
- ggf. `src/hooks/useTwoShotAutoTrigger.ts` oder die Toast-Fehlerstelle, falls der generische Fehler dort entsteht
- `mem/features/video-composer/dialog-shot-pipeline`
- `.lovable/plan.md`

## Benötigte externe Konfiguration

Wenn die gespeicherten AWS-Credentials tatsächlich abgelaufen/falsch sind, muss zusätzlich ein Secret aktualisiert werden:

- Entweder neue permanente AWS Render-Credentials für `AWS_ACCESS_KEY_ID` und `AWS_SECRET_ACCESS_KEY`
- Oder bei temporären Credentials zusätzlich `AWS_SESSION_TOKEN`

Der Code-Fix sorgt dafür, dass ein vorhandener Session Token korrekt verwendet wird und dass der Fehler künftig eindeutig angezeigt wird.

## Erwartetes Ergebnis

- Der Edge-Function-Fehler wird konkret und verständlich.
- Keine endlosen 13-Minuten-Hänger mehr bei ungültigen AWS-Credentials.
- Die Artlist-Logik bleibt erhalten: keine Video-Chaining-Rückkehr, kein falscher Sprecher.
- Die aktuelle Szene kann nach korrigierten Credentials durch den finalen Stitch abgeschlossen werden, ohne neue Sync.so-Kosten.

<presentation-actions>
  <presentation-open-history>View History</presentation-open-history>
</presentation-actions>

<presentation-actions>
<presentation-link url="https://docs.lovable.dev/tips-tricks/troubleshooting">Troubleshooting docs</presentation-link>
</presentation-actions>