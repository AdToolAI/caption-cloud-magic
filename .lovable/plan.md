# v129.22.1 — Rekognition Region Hardening

## Problem

Edge-Logs zeigen:

```
[face-detect/aws] v129.22 rekognition primary plate=720x720 region=Global frames=1
[face-detect/aws] rekognition request failed frame=0:
  dns error: failed to lookup address information for
  rekognition.global.amazonaws.com
```

Das Secret `AWS_REGION` enthält den String `"Global"` (vermutlich historisch für S3/CloudFront gesetzt). Daraus baut `face-detect-mediapipe.ts` den Host `rekognition.global.amazonaws.com` — diese Region/dieser Host existiert bei AWS Rekognition nicht. Jeder Request scheitert mit DNS-Fehler → `rekognition_zero_faces` → Gemini-Fallback → Forensics zeigt `PROVIDER: ERROR` und der rote "Crop-Bug vor Versand"-Banner bleibt.

**AWS wird also aufgerufen, der Call kommt aber nie bei AWS an.**

## Fix (1 Datei, ~10 Zeilen)

### `supabase/functions/_shared/face-detect-mediapipe.ts`

1. Neue Helper `resolveRekognitionRegion()`:
   - Erst `REKOGNITION_REGION` lesen (optionaler Override).
   - Sonst `AWS_REGION` lesen, aber **nur wenn** sie zum Regex `^[a-z]{2}-[a-z]+-\d$` passt (`us-east-1`, `eu-central-1`, …).
   - Sonst Fallback `"us-east-1"` (Rekognition ist dort verfügbar und am günstigsten).
   - Einmaliger `console.warn` wenn `AWS_REGION` gesetzt aber ungültig war ("AWS_REGION='Global' is not a valid Rekognition region, falling back to us-east-1").
2. `AWS_REGION` Konstante durch `REKOGNITION_REGION_RESOLVED` ersetzen — überall in der Datei (Host, Signing, Logs).
3. Versions-Bump im Top-Kommentar + Log-Prefix auf `v129.22.1`.

### `src/components/admin/SyncsoForensicsSheet.tsx`

- Header-Badge `V129.22 · AWS REKOGNITION PRIMARY` → `V129.22.1 · AWS REKOGNITION PRIMARY`.
- Sonst keine UI-Änderung — wenn der Fix greift, zeigt das Sheet automatisch `PROVIDER: AWS_REKOGNITION` (grün) statt `PROVIDER: ERROR`.

## Bewusst NICHT in diesem Fix

- Kein neues Secret zwingend nötig — User kann `REKOGNITION_REGION` setzen, muss aber nicht.
- Kein Anfassen von `syncso-preflight`, Dispatch, Refund, Watchdog, Sync.so-Payload.
- Kein Face-Gate / Crop-Transform-Fix — das ist Folge-Bug, der erst sichtbar wird wenn Rekognition wieder Treffer liefert.
- Kein Wechsel zu Google Vision / Replicate.

## Verifikation

Nach Deploy in derselben Forensics-Szene auf einem Sprecher klicken:

- Edge-Log: `[face-detect/aws] v129.22.1 rekognition primary plate=… region=us-east-1 frames=1`
- Edge-Log: `[face-detect/aws] rekognition ok plate=… raw=1 merged=1`
- Sheet zeigt `PROVIDER: AWS_REKOGNITION` (grün), `MEDIAPIPE_FACES ≥ 1`, `MEDIAPIPE_MS ≈ 300–1200ms`, `SOURCE: aws_rekognition`.
- Roter "Crop-Bug vor Versand" verschwindet wenn die detektierte Bbox die Intent-Koord trifft. Wenn er bleibt, ist es der erwartete Folge-Bug (Coord-Transformation), den wir dann separat angehen.
