## Befund

Der Fehler ist jetzt klarer eingegrenzt:

- Der Export-Call `render-directors-cut` endet im Browser mit `504` / `Edge Function returned a non-2xx status code`.
- In den Funktionslogs stoppt der Ablauf direkt nach `Invoking Remotion Lambda...`; es kommt kein `Lambda response` zurück.
- In `director_cut_renders` wurde ein neuer Job angelegt, aber er steckt auf `status = processing` mit `remotion_render_id = null`.
- Ältere Versuche endeten nachträglich mit `Access Denied`, ebenfalls ohne echte Remotion-Render-ID.

Das bedeutet: Das Problem liegt nicht mehr an der Preflight-Warnung oder an den Szenen/Transitions. Der Start der AWS/Remotion-Lambda-Antwort blockiert so lange, dass unsere Backend-Funktion vom Gateway abgebrochen wird. Dadurch bekommt die UI nur den generischen Edge-Function-Fehler und der Renderjob bleibt in einem halbfertigen Zustand hängen.

## Plan

1. **Render-Start robust gegen Lambda-Hänger machen**
   - In `supabase/functions/render-directors-cut/index.ts` den AWS-Lambda-Start mit einem festen Start-Timeout absichern.
   - Wenn Lambda innerhalb dieses Zeitfensters keine `renderId` zurückgibt, wird der Job sauber als `failed` markiert, statt als `processing` hängen zu bleiben.
   - Credits werden automatisch zurückerstattet.
   - Die Funktion antwortet dann mit einer klaren Fehlermeldung statt 504.

2. **Tracking-Daten direkt beim Start speichern**
   - Beim Anlegen/Starten des Jobs `tracking_mode`, `out_name`, `lambda_invoked_at`, `failure_stage` in `render_config` sichern.
   - Dadurch kann `check-remotion-progress` später unterscheiden zwischen:
     - Lambda nie gestartet
     - Lambda gestartet, aber kein Fortschritt
     - Render fertig, Webhook fehlt

3. **Frontend-Fehlermeldung lesbar machen**
   - In `src/components/directors-cut/studio/CapCutEditor.tsx` den bereits vorhandenen Error-Extractor nutzen.
   - Statt `Edge Function returned a non-2xx status code` soll die echte Backend-Meldung angezeigt werden, z. B. `Render konnte nicht gestartet werden...` oder `Access Denied...`.

4. **Stale processing Jobs entschärfen**
   - Eine kleine Datenkorrektur für die aktuell hängenden Director's-Cut-Jobs ohne `remotion_render_id` einplanen.
   - Diese Jobs werden auf `failed` gesetzt und als `lambda_start_timeout` markiert, damit sie nicht weiter als aktive Render gelten.
   - Falls bei diesen Jobs Credits abgezogen wurden, wird idempotent/refund-sicher zurückerstattet.

5. **Validierung nach Umsetzung**
   - `render-directors-cut` deployen.
   - Einen frischen Export starten.
   - Erwartung: entweder sofort erfolgreiche Antwort mit `remotion_render_id`, oder eine klare 4xx/5xx JSON-Meldung mit sauberem Refund und ohne hängenden `processing`-Job.

## Technische Details

- Hauptdatei: `supabase/functions/render-directors-cut/index.ts`
- UI-Datei: `src/components/directors-cut/studio/CapCutEditor.tsx`
- Bestehender Helper: `src/lib/functionsError.ts`
- Betroffene Tabelle: `director_cut_renders`

Wichtig: Dieser Plan behebt zuerst die kaputte Fehler-/Timeout-Behandlung und macht den echten AWS/Remotion-Fehler sichtbar. Falls danach weiterhin `Access Denied` von AWS kommt, ist das der nächste gezielte Fix: Lambda-Bundle/S3-Bucket-Berechtigungen bzw. Serve-URL-Zugriff.