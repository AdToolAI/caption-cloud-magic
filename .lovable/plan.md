# v143 — Plate-Rehost: Das wahre NOOP-Root-Cause

## Was der Diagnostic-Run gezeigt hat

Alle 5 Sync.so-Varianten (auto_detect, flat coords, bbox_url, bbox inline, lipsync-2-pro) sind mit **identischem Fehler** gestorben:

```
HTTP 422
errorCode: generation_input_video_inaccessible
message: "The provided video URL is inaccessible."
suggestion: "Make sure the video URL is publicly fetchable (not expired
            or auth-gated), or upload the file via POST /v2/assets/upload
            and pass the assetId instead."
```

Die Plate war eine **presigned `s3.eu-central-1.amazonaws.com/...`-URL** von Hailuo (Replicate). Diese URLs leben nur ~1 Stunde. Zum Zeitpunkt des Diagnostic-Runs war sie tot.

## Was das für die Live-Pipeline bedeutet

Wir haben seit Wochen ASD/Coords/Boxen-Hypothesen gejagt (v76, v122, v130, v134, v140, v141, v142), dabei war das eigentliche Problem schlicht: **Sync.so kann die Plate-URLs gar nicht laden, sobald sie älter als ~60 min sind.**

In Dialogszenen mit 4 Sprechern dauert die Generierung der Preclips + Audio-Synthese + Sync.so-Dispatch oft länger als 60 min (Replicate-Queues, Watchdog-Resets, Retries). Spätestens beim 3./4. Pass ist die ursprüngliche Plate-URL tot — Sync.so liefert `422` zurück, unser Code interpretiert das aktuell **nicht** als Fehler sondern fällt in die NOOP-Escalation-Ladder.

## Plan (3 Schritte)

### Schritt 1 — Hard-Evidence im Diagnostic bestätigen
Diagnostic-Run mit einer **frischen** Plate wiederholen (z.B. gerade eben gerenderter Preclip, <5 min alt). Erwartung: alle 5 Varianten laufen durch, mindestens eine bewegt Lippen. Damit ist die URL-Lifetime-These bewiesen.

### Schritt 2 — Plate immer in unseren Storage rehosten
Bevor irgendein Sync.so-Dispatch (compose-dialog-segments, compose-dialog-scene, compose-lipsync-scene, lipsync-diagnostic) eine Plate sendet:
- Plate von der Replicate/S3-URL nach `lipsync-plates/` Storage-Bucket kopieren (eigene Lovable Cloud, signed URL mit 7d TTL)
- Diese stabile URL an Sync.so schicken
- Alternativ: `POST /v2/assets/upload` direkt zu Sync.so (assetId) — robuster, aber zusätzliche Roundtrip-Latenz

### Schritt 3 — 422 als Hard-Error in der State-Machine
In `sync-so-webhook` und `lipsync-watchdog`:
- HTTP 422 mit `generation_input_video_inaccessible` → **nicht** in NOOP-Ladder eskalieren, sondern sofort als `failed` markieren mit klarer Fehlermeldung
- Refund triggern
- UI zeigt: "Plate-URL war beim Dispatch nicht mehr abrufbar — bitte Szene neu rendern"

## Was NICHT angefasst wird

- v140 Payload-Shape (war nie das Problem)
- v141 State-Machine-Hardening (bleibt)
- v134 NOOP-Escalation-Ladder (bleibt — greift nur noch bei echten NOOPs nach Schritt 2)
- ASD-Coords-Logik (bleibt unverändert)

## Technische Details

**Neuer Storage-Bucket** `lipsync-plates`:
- Private, RLS: nur Service-Role schreibt, Sync.so liest via signed URL (7d)
- Pfad: `{user_id}/{scene_id}/{pass_id}.mp4`

**Neue Helper-Function** `_shared/rehostPlate.ts`:
- Input: presigned S3-URL
- Stream-Download → Storage-Upload → signed URL zurück
- Idempotent über deterministisches Pfad-Hashing

**Call-Sites die rehostPlate() bekommen:**
- `compose-dialog-segments/index.ts` (Multi-Pass)
- `compose-dialog-scene/index.ts` (Single-Speaker)
- `compose-lipsync-scene/index.ts` (Legacy)
- `lipsync-diagnostic/index.ts` (damit auch Diagnostic stabile URLs nutzt)

**422-Handler** in `sync-so-webhook/index.ts`:
```ts
if (status === 422 && errorCode === 'generation_input_video_inaccessible') {
  await markPassFailed(passId, 'plate_url_expired');
  await refundCredits(userId, passId);
  return; // KEINE NOOP-Escalation
}
```

## Doku
- Neue Memory: `mem/architecture/lipsync/v143-plate-rehost.md`
- Update `mem/architecture/lipsync/v142-diagnostic-mode.md` — Outcome: "Diagnostic bewies URL-Lifetime, nicht ASD"
