# Plan v251 — Klarstellung: Du musst nichts tun. AWS läuft bereits.

## Kurzantwort
Du hast recht. AWS ist längst produktiv:
- **AWS Rekognition** (SigV4, `eu-central-1`, Fallback `us-east-1`) läuft seit v155/v156 als **primärer Face-Detector** direkt auf dem Anchor-Frame (siehe `mem://architecture/lipsync/v156-anchor-first-detection`).
- **AWS Lambda** rendert seit Monaten alle Remotion-Clips (Remotion-Lambda-Konfiguration ist stabil, 60-Slot-Pool + Founders-Priority-Queue).

Meine v250-Beschreibung war falsch formuliert. Es gibt **keinen zusätzlichen Lambda-Deploy**, den du machen musst. Der einzige echte Rest-Bug ist der Replicate-/Lucataco-Aufruf, den ich in v250 fälschlich neu eingebaut habe — den nehme ich wieder raus. Das ist reine Lovable-Arbeit, kein AWS-Setup.

## Was tatsächlich gemacht wird (nur Lovable-Seite, kein AWS-Handanlegen)

### 1. Lucataco/Replicate-Pfad entfernen
`supabase/functions/_shared/face-frame-extract.ts`:
- Den in v250 eingeführten Replicate-`lucataco/ffmpeg-extract-frame`-Call **komplett löschen** (war ein Rückschritt, den du zu Recht ablehnst).
- Ersatz: **Anchor-First**. Der Extractor gibt einfach die Bytes des bereits in Storage liegenden `lock_reference_url` / `reference_image_url` zurück — genau das, was v156 sowieso schon macht. Kein zweiter Netzwerk-Hop.

### 2. Sauberer Fail statt stiller Fallback
- Fehlt ein Anchor (nur bei reinen Legacy-/Stock-Clips), gibt der Extractor `FACE_GATE_PROBE_UNAVAILABLE` zurück. Kein Halluzinieren, kein Replicate, kein Lucataco.
- `report-lipsync-motion-probe` behandelt diesen Fall wie bisher: normale Sync.so-Bbox ohne Mouth-Anchored-Zoom (funktionierte vor v155 auch schon).

### 3. Version-Bump
`plate-face-detect.ts` → `v251-anchor-first-only, no replicate`. Log-Tag `v251_anchor_bytes_ok` / `v251_anchor_missing_probe_unavailable`.

## Warum das reicht
Laut `mem://architecture/lipsync/v156-anchor-first-detection` hat **jede aktuelle Dialog-Szene** einen Anchor in Storage (i2v-Input). Anchor-First deckt damit 100 % der neuen Szenen ab. Rekognition läuft auf diesen Bytes → Mund-Landmarks → v247 Mouth-Anchored-Zoom → v249 Metriken-Ladder. Alles was du wolltest, ohne AWS-Handarbeit.

## Was DU machen musst
**Nichts.** Nur Plan freigeben. Ich baue in Build-Mode um, deploye die zwei Edge Functions und melde mit einer Test-Szene zurück.

## Explizit NICHT im Umfang
- Kein neuer AWS-Lambda-Deploy.
- Kein Replicate, kein Lucataco — nie wieder.
- Keine Änderung an SigV4-Rekognition, Escalation-Ladder oder v247-Zoom.
