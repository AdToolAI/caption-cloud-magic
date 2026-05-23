## Ergebnis der Prüfung

Der Screenshot zeigt `InvalidAccessKeyId` beim lokalen Befehl `npx remotion lambda sites create ...`. Das ist ein lokaler AWS-Credential-/Account-Zugriffsfehler auf deinem Rechner. Die gehostete Backend-Umgebung ist erreichbar und die Remotion-Secrets sind grundsätzlich vorhanden.

Der eigentliche aktuelle App-Fehler ist: Die zuletzt eingebaute `DialogStitchVideo`-Composition liegt nur im Code, aber nicht im live verwendeten Remotion-S3-Bundle. Um sie ins Bundle zu bringen, bräuchte man normalerweise gültigen AWS-Zugriff zum Upload. Genau daran scheitert dein lokaler Befehl.

## Einschätzung

Wir müssen nicht zwingend warten, bis du dich wieder in AWS einloggen kannst. Es gibt einen sicheren Workaround: Wir vermeiden vorerst komplett die neue `DialogStitchVideo`-Composition und verwenden eine bereits live im bestehenden Bundle vorhandene Composition.

## Plan

1. **Kurzfristiger Fix ohne AWS-Login**
   - `render-dialog-stitch` wird so geändert, dass es nicht mehr `DialogStitchVideo` rendert.
   - Stattdessen nutzt es `DirectorsCutVideo`, weil diese Composition bereits im live verwendeten Remotion-Bundle vorhanden ist.
   - Wir bauen die Dialog-Timeline als Szenenliste:
     - Lücken kommen aus dem Master-Video.
     - Sprecher-Fenster kommen aus den fertigen Sync.so-Output-Videos.
     - `voiceoverUrl` bleibt die Master-WAV-Spur.
   - Dadurch ist kein neuer Remotion-Bundle-Upload nötig.

2. **Webhook unverändert weiterverwenden**
   - `remotion-webhook` kann `source: 'dialog-stitch'` bereits verarbeiten.
   - Nach erfolgreichem Render schreibt er weiterhin `clip_url`, `lip_sync_status = done`, `twoshot_stage = done` zurück.

3. **Fehlerhafte Szenen wieder reaktivieren**
   - Die zwei zuletzt fehlgeschlagenen Szenen mit `dialog_stitch_dispatch_failed` werden wieder auf `stitching/running` gesetzt, sofern alle Shots `ready` und `output_url` vorhanden sind.
   - Es wird kein neuer Sync.so-Job gestartet, also keine unnötigen neuen Lipsync-Kosten.

4. **Edge Functions deployen und testen**
   - `render-dialog-stitch` deployen.
   - Optional `poll-dialog-shots` nur dann deployen, falls wir Kommentare/kleine Statuslogik anpassen.
   - Danach `poll-dialog-shots` gezielt für eine betroffene Szene anstoßen und Logs prüfen.

## Technische Details

- Kein AWS-Login vom Nutzer nötig.
- Kein `remotion lambda sites create` nötig.
- Kein neues S3-Site-Bundle nötig.
- Der Workaround nutzt vorhandene Lambda/Remotion-Infrastruktur und das bestehende `DirectorsCutVideo`-Template.
- Sobald dein AWS-Zugriff wieder funktioniert, können wir später optional sauber auf die spezialisierte `DialogStitchVideo`-Composition umstellen und das Bundle korrekt deployen.

## Warum das sicherer ist

Der letzte Ansatz war technisch sauber, aber abhängig von einem neuen Remotion-Bundle. Weil der Bundle-Upload aktuell durch AWS-Credentials blockiert ist, ist der schnellste stabile Weg, eine vorhandene live Composition zweckzuentfremden, statt auf AWS-Support zu warten.