## Problem

Der Render läuft technisch sauber an, aber die AWS-Lambda bricht direkt mit `AccessDenied` ab. In den Webhook-Logs sieht man:

```
type: "error"
errors: [{ name: "AccessDenied", message: "Access Denied" }]
bucketName: "remotionlambda-eucentral1-13gm4o6s90"   ← Output-Bucket (korrekt)
serveUrl:  "remotionlambda-eucentral1-6ul51trd3p..." ← Bundle-Bucket (falsch!)
```

## Root Cause

Die Render-Pipeline verwendet **zwei verschiedene S3-Buckets**:

| Zweck            | Bucket                                  | Quelle                          |
|------------------|-----------------------------------------|----------------------------------|
| Lambda-Output    | `remotionlambda-eucentral1-13gm4o6s90`  | `DEFAULT_BUCKET_NAME` (Code)     |
| Remotion-Bundle  | `remotionlambda-eucentral1-6ul51trd3p`  | Secret `REMOTION_SERVE_URL`      |

Die AWS-Lambda-Rolle hat aber nur Berechtigung auf den **kanonischen Bucket** `…-13gm4o6s90` (genau dorthin deployt `scripts/deploy-remotion-bundle.sh` Zeile 23 auch das Bundle). Lambda versucht das Bundle aus `…-6ul51trd3p` zu laden → **S3 AccessDenied**.

Deshalb landet jeder Render — egal welches Format oder welche Szenen — sofort im `failed`-Zustand mit „Access Denied".

## Fix

Den Secret `REMOTION_SERVE_URL` auf den korrekten Bucket aktualisieren:

**alt:**
```
https://remotionlambda-eucentral1-6ul51trd3p.s3.eu-central-1.amazonaws.com/sites/adtool-remotion-bundle/index.html
```

**neu:**
```
https://remotionlambda-eucentral1-13gm4o6s90.s3.eu-central-1.amazonaws.com/sites/adtool-remotion-bundle/index.html
```

Voraussetzung: das Bundle muss in `…-13gm4o6s90/sites/adtool-remotion-bundle/` liegen. Genau das tut `scripts/deploy-remotion-bundle.sh` standardmäßig — wenn das Skript jemals lief, ist der Bundle schon dort. Falls nicht, wird das Skript einmal ausgeführt.

## Schritte

1. Secret `REMOTION_SERVE_URL` auf den oben genannten neuen Wert setzen (über den Secrets-Manager).
2. Verifizieren, dass `https://remotionlambda-eucentral1-13gm4o6s90.s3.eu-central-1.amazonaws.com/sites/adtool-remotion-bundle/bundle-version.json` erreichbar ist (200 + JSON).  
   Falls 404/AccessDenied → einmalig `./scripts/deploy-remotion-bundle.sh` laufen lassen.
3. Im AdTool erneut „1 Format(e) rendern" klicken und Render-Status prüfen.

## Keine Code-Änderungen nötig

Es ist reine Infrastruktur-Konfiguration. Weder Edge-Functions noch Frontend müssen angefasst werden.
