## Befund

Die Buckets waren in den letzten Fixes vertauscht. Korrekt ist:

| Zweck | Bucket |
|---|---|
| Bundle (Serve URL) — **korrekt/neu** | `remotionlambda-eucentral1-6ul51trd3p` |
| Output / falsch verwendet als „canonical" | `remotionlambda-eucentral1-13gm4o6s90` |

Die zuvor eingebaute `normalizeRemotionServeUrl()` in `render-with-remotion` zieht jeden Wert auf den **falschen** Bucket `13gm4o6s90` und überschreibt damit gerade das, was vom Secret korrekt gesetzt wurde. Deshalb landet der Render bei `…-13gm4o6s90/sites/adtool-remotion-bundle/index.html`, wo S3 mit `AllAccessDisabled` antwortet (dort liegt das Bundle nicht).

Außerdem zeigt `scripts/deploy-remotion-bundle.sh` aktuell auf den falschen Bucket `13gm4o6s90`, sodass jedes erneute Deploy das Bundle weiterhin in den falschen Bucket schreiben würde.

## Plan

1. **Canonical-Bucket korrigieren**
   - In `supabase/functions/render-with-remotion/index.ts` den `DEFAULT_BUCKET_NAME` (bzw. die Normalisierungs-Konstante) auf `remotionlambda-eucentral1-6ul51trd3p` setzen.
   - `normalizeRemotionServeUrl()` umdrehen: wenn das Secret auf `…-13gm4o6s90` zeigt, automatisch auf `…-6ul51trd3p` umschreiben. Sonst Secret unverändert übernehmen.
   - Warn-Log bleibt erhalten, aber mit korrektem „from/to".

2. **Deploy-Skript korrigieren**
   - In `scripts/deploy-remotion-bundle.sh` `S3_BUCKET` auf `remotionlambda-eucentral1-6ul51trd3p` setzen, Site-Pfad bleibt `sites/adtool-remotion-bundle`.
   - Verifizierungs-URL am Ende des Skripts entsprechend anpassen.

3. **Edge-Function deployen**
   - `render-with-remotion` neu deployen, damit die invertierte Normalisierung aktiv wird.

4. **Verifikation**
   - Erneut „1 Format(e) rendern" klicken.
   - In den Function-Logs prüfen, dass `serveUrl` jetzt mit `…-6ul51trd3p…` beginnt.
   - Wenn weiterhin `AllAccessDisabled` auftritt, liegt es an AWS-Bucket-Policy/Public-Access-Block auf `…-6ul51trd3p` — dann ist es kein Code-Problem mehr.

## Technische Details

- Keine Schema- oder Daten-Änderungen.
- Keine Secret-Änderung nötig — Code-seitige Normalisierung deckt sowohl korrekt gesetzte als auch veraltete Secret-Werte ab.
- `DEFAULT_BUCKET_NAME` wird projektweit nur für die Serve-URL-Normalisierung verwendet; Output-Bucket-Logik bleibt unverändert (Remotion Lambda nutzt seinen eigenen konfigurierten Output-Bucket).