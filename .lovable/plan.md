## Befund

Der Serve-URL-Fix ist aktiv: Die aktuellen Logs zeigen, dass `serveUrl` jetzt korrekt auf den neuen Bundle-Bucket `remotionlambda-eucentral1-6ul51trd3p` zeigt.

Der neue Fehler kommt danach aus dem Remotion-Lambda-Webhook:

- `bucketName`: `remotionlambda-eucentral1-13gm4o6s90`
- Fehler: `AccessDenied: Access Denied`
- Stadium: Lambda-Runtime, nicht mehr beim Laden des Bundles

Das bedeutet: Der alte Bucket wird jetzt als Output-Bucket verwendet. Dort versucht Lambda zu schreiben/lesen bzw. ACLs zu setzen. Genau das scheitert mit S3/IAM-Berechtigungen.

## Plan

1. **Output-Bucket nicht mehr hart auf den alten Bucket erzwingen**
   - In `render-with-remotion` die feste `bucketName = DEFAULT_BUCKET_NAME`-Übergabe entfernen oder auf den funktionierenden Bundle-/Lambda-Bucket umstellen.
   - Ziel: Remotion Lambda soll nicht mehr in `remotionlambda-eucentral1-13gm4o6s90` schreiben, wenn dieser Bucket keine gültigen Rechte hat.

2. **Payload-Normalisierung absichern**
   - In `_shared/remotion-payload.ts` verhindern, dass ein leerer oder veralteter `bucketName` wieder in den Lambda-Payload gelangt.
   - Falls `bucketName` weggelassen wird, kann Remotion den passenden Bucket selbst bestimmen; alternativ nutzen wir den neuen `6ul51trd3p`-Bucket konsistent für Bundle und Output.

3. **Datenbank-Tracking anpassen**
   - `video_renders.bucket_name` und `content_config.bucket_name` dürfen nicht mehr irreführend den alten Bucket speichern, wenn der Render nicht dort landet.
   - Bei automatischer Bucket-Wahl speichern wir `null` oder den tatsächlich verwendeten Bucket aus dem Lambda/Webhook.

4. **Edge Function neu deployen**
   - `render-with-remotion` deployen.
   - Falls `_shared/remotion-payload.ts` geändert wird, wird es mit der Funktion mitdeployt.

5. **Verifikation über Logs**
   - Neuen Test-Render starten.
   - Prüfen, dass der Lambda-Payload entweder keinen `bucketName` mehr enthält oder nicht mehr `13gm4o6s90` nutzt.
   - Wenn danach weiterhin `AccessDenied` kommt, ist es eindeutig eine AWS-IAM/S3-Policy der tatsächlich verwendeten Output-Location.

## Technische Details

- Die Serve URL ist nicht mehr das Problem; sie zeigt bereits korrekt auf `6ul51trd3p`.
- Der Fehler entsteht beim Output-Bucket `13gm4o6s90`.
- Remotion-Doku empfiehlt, `forceBucketName`/festen Bucket nicht zu erzwingen, sondern Remotion den Bucket bestimmen zu lassen, außer die IAM-Rechte sind garantiert korrekt.
- Kein Datenbankschema nötig, keine Migration nötig.