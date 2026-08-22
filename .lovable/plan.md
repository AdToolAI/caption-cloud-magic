# Nächster Gate: V441 Runtime-Verifikation am S11-Rerender

## Ausgangslage (bestätigt)

- Lokales Repo ist wieder auf `main`, Remotion-Bundle wurde erfolgreich hochgeladen.
- Serve URL: `https://remotionlambda-eucentral1-6ul51trd3p.s3.eu-central-1.amazonaws.com/sites/adtool-remotion-bundle/index.html`, Site-Name `adtool-remotion-bundle` — identisch zum konfigurierten Ziel in `scripts/deploy-remotion-bundle.sh`.
- V441-Backend (Webhook-Write-Contract + Watchdog-Age-Cap) ist deployed.
- Offen aus dem letzten Smoke: der Produktions-Frontend-Bundle wurde beim letzten Check noch als alt ausgeliefert. Das muss vor der Bewertung der Fortschrittsanzeige erneut geprüft werden — es ist noch nicht bestätigt, dass die neue Version live ist.

## Sofort: AWS-Keys rotieren

Die Remotion-AWS-Credentials wurden im Terminal im Klartext gesetzt und sind auf Screenshots sichtbar. In der AWS-Konsole (IAM → Users → Security credentials) den alten Access Key deaktivieren und löschen, einen neuen erzeugen und nur noch über eine lokale, gitignorierte `.env` verwenden.

## Schritt 1: Frontend-Auslieferung prüfen (read-only)

Erneut prüfen, welcher Bundle-Pfad und welche Deployment-ID auf `useadtool.ai` und `caption-cloud-magic.lovable.app` ausgeliefert werden. Solange dort noch `index.CRrrFFh3.js` kommt, sind V438/V440-Progressfixes nicht live und die Fortschrittsanzeige im S11-Test ist nicht aussagekräftig. In dem Fall zuerst erneut publishen.

## Schritt 2: Owner-Smoke S11 (manuell durch dich)

Nur wenn Schritt 1 den neuen Bundle bestätigt:

1. Motion Studio, Szene S11 (`e658509d…`) als Owner öffnen.
2. Genau einmal „Reset & retry lip-sync" auslösen.
3. Nicht mehrfach klicken, keinen zweiten Reset — sonst ist der Lauf für die Auswertung unbrauchbar.
4. Danach hier `GO` schreiben.

## Schritt 3: Read-only Auswertung des Laufs

Auswertung anhand der Live-Daten, mit vier festen Verdikten:

- **Terminalization**: Wird ein `indeterminate`-Verdikt jetzt über `ssw:noop_fail` geschrieben, statt in `write_id_mismatch` zu laufen?
- **Watchdog**: Greift der 10-Minuten-Age-Cap auf Pass-Ebene bei nicht angewendeten Verdikten?
- **Progress**: Bleibt der Balken monoton und erreicht nicht mehr vorzeitig 99 %?
- **Anchor-Lifecycle**: Werden nach dem Reset gültige Anker verwendet, statt auf gelöschte Storage-Objekte zu zeigen (`NoSuchKey`)?

## Danach

Je nach Ergebnis entweder Abschluss der Lip-Sync-Kette oder ein eng begrenzter V442-Gate für genau den Punkt, der noch fehlschlägt.

## Technische Details

- Bundle-Ziel und Cache-Regeln stehen in `scripts/deploy-remotion-bundle.sh`; `index.html` und `bundle.js` dürfen nie die `immutable`-Cache-Policy erben.
- Relevante Backend-Pfade: `supabase/functions/sync-so-webhook/index.ts`, `supabase/functions/lipsync-watchdog/index.ts`, RPC `composer_apply_sync_segment_result`.
- Auswertung erfolgt read-only über `composer_scenes`, `composer_pipeline_jobs` und die Edge-Function-Logs.
