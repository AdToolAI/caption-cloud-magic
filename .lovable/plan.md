## Plan: v129.22.2 — Rekognition Region auf `eu-central-1` (Frankfurt) angleichen

Du hast recht: Unser AWS-Stack (Remotion Lambda) läuft in **`eu-central-1`** (Frankfurt). Den gleichen Region-Wert sollten wir auch für Rekognition nehmen — sonst geht jedes Frame quer durch den Atlantik nach Virginia, was Latenz, Kosten und (wegen GDPR) Compliance unnötig verschlechtert.

### Was sich ändert

**1. `supabase/functions/_shared/face-detect-mediapipe.ts`**
- Default-Fallback in `resolveRekognitionRegion()` von `"us-east-1"` → `"eu-central-1"`.
- Reihenfolge bleibt: `REKOGNITION_REGION` (override) → validiertes `AWS_REGION` → **`eu-central-1`** (Default).
- Damit gilt: solange `AWS_REGION="Global"` bleibt, baut die Funktion automatisch den Host `rekognition.eu-central-1.amazonaws.com` und signiert mit `eu-central-1`.
- Der `console.warn` bleibt, ändert nur den Hinweistext auf den neuen Default.

**2. `src/components/admin/SyncsoForensicsSheet.tsx`**
- Version-Bump auf `v129.22.2` (nur Anzeige).
- Keine UI-Logikänderung — `PROVIDER: AWS_REKOGNITION` wird grün, sobald Detection klappt.

### Was sich NICHT ändert
- Keine neuen Secrets nötig. AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY funktionieren regions­übergreifend (IAM ist global, Rekognition hat in `eu-central-1` `DetectFaces` voll verfügbar).
- `AWS_REGION="Global"` lassen wir bewusst unangetastet, weil andere Module (S3/CloudFront/Lambda-Helper) es so erwarten.
- Keine Änderung an Dispatch, Refund, Watchdog, Sync.so, Composer, Director's Cut, neuen Providern.

### Verifikation nach Deploy
Im Forensics-Sheet einer Szene:
- `REGION: eu-central-1` (neues Detail im Log)
- `PROVIDER: AWS_REKOGNITION` (grün)
- `MEDIAPIPE_FACES ≥ 1`, `MEDIAPIPE_MS ≈ 150–600 ms` (deutlich schneller als us-east-1, da EU-EU statt EU-US)
- Rotes "Crop-Bug vor Versand" verschwindet, sobald BBox = Intent-Koordinaten matcht. Falls es bleibt → reiner Coord-Transform-Bug, separat fixbar.

### Optional (nicht in diesem Schritt)
Falls du möchtest, können wir später `REKOGNITION_REGION` als explizites Secret setzen, um die Region nicht im Code zu hardcoden — aber für jetzt ist der `eu-central-1`-Default sauber und reicht.
