# Plan v252 — Face-Gate-Probe: AWS-only

## Ziel
Der Preflight-Check direkt vor jedem Sync.so-Dispatch (`_shared/syncso-face-gate.ts`) läuft aktuell auf **Gemini 2.5 Flash** (Textprompt „yes_one_face_at_coord / no_face / …"). Der ist regelmäßig flaky (429/5xx, halluzinierte Text-Antworten, Parser-Fails → `unparsed`). AWS Rekognition liefert für exakt diesen Job (Ja/Nein Gesicht + Bbox am Coord) deterministische Bboxes mit Confidence — genau das, was wir brauchen.

**Umstellung nur für den Face-Gate-Probe.** Identity-Matching (`plate-face-identity.ts`) und Cartoon-Rescue (`plate-face-detect.ts`) bleiben bei Gemini — das sind andere Aufgaben, die Rekognition strukturell nicht kann.

## Scope

### Geändert
`supabase/functions/_shared/syncso-face-gate.ts`
- Stage 2 („ask Gemini about the extracted frame") wird ersetzt durch `detectFacesMediaPipe(...)` (= AWS Rekognition DetectFaces auf denselben JPEG-Bytes).
- Verdict-Ableitung direkt aus dem Rekognition-Ergebnis:
  - `0 faces` → `code: "no_face"` (hard fail, refund + skip dispatch)
  - `≥2 faces` bei multi-speaker plate → `code: "multiple_faces"` (hard fail); bei single-speaker preclip → soft pass wie bisher
  - `1 face` + Center innerhalb ±15 % vom Intent-Coord (bereits auf Bild-Dim normalisiert) → `code: "ok"`
  - `1 face` außerhalb Toleranz, mit `plateWidth/plateHeight` gesetzt → `code: "ok_after_snap"` mit Rekognition-Center als `snapped_coord` (der bestehende Auto-Snap-Pfad — Rekognition wurde dort schon vorher aufgerufen, jetzt sparen wir uns den zweiten Call)
  - `1 face` außerhalb Toleranz ohne Plate-Dims → `code: "not_at_coord"` (hard fail, wie legacy)
- Netzwerk-Errors / IAM-Fehler / Timeouts → `code: "probe_unavailable"` (non-blocking, wie heute bei Gemini).
- Felder `gemini_ms`, `raw_reply` bleiben aus Kompatibilität im Result, werden aber mit den Rekognition-Werten (`aws_ms`, kurze `raw_reply="aws_rek:1_face@0.42,0.51"`-Zeile) befüllt, damit Forensik-UI unverändert weiterläuft. Neu: `detector: "aws_rekognition"` im Meta-Objekt.

### Unverändert
- `_shared/face-frame-extract.ts` — bleibt Anchor-First (v251), keine Änderung.
- `_shared/face-detect-mediapipe.ts` — wird schon von `plate-face-detect.ts` genutzt, keine Änderung nötig.
- `_shared/plate-face-detect.ts` — Cartoon-Rescue via Gemini bleibt, weil Rekognition auf Cartoons/Illustrationen ~0 Faces liefert.
- `_shared/plate-face-identity.ts` — Identity-Matching bleibt Gemini (Rekognition kennt unsere Charaktere nicht).
- Escalation-Ladder in `report-lipsync-motion-probe` — unverändert (liest weiterhin `detector_used`).

## Grenzen / bewusste Trade-offs
- **Cartoons / stilisierte Avatare**: Wenn ein Nutzer mal einen gezeichneten Charakter durch die Dialog-Pipeline schickt, wird der Face-Gate jetzt öfter `no_face` sagen und die Szene refunden statt Gemini-Weichspüler zu geben. Das ist gewollt und im Einklang mit unserer generellen v156-Härte („no hallucinated faces"). Cast & World generiert photoreal, also kein Praxisproblem.
- **Preclip-Trusted-Pfad** bleibt wie bisher: wenn Preclip schon validiert wurde, ist ein Rekognition-Miss ein soft pass (probe_unavailable), kein Hard-Fail.

## Verifikation
1. Rendere eine 2-Sprecher-Szene und eine 4-Sprecher-Szene.
2. In `syncso_dispatch_log` erwarten: `detector_used='aws_rekognition'`, `face_gate_code='ok'` bzw. `ok_after_snap`, `gemini_ms` klein (nur noch Meta-Feld, kein echter Gemini-Call).
3. Edge-Function-Logs: kein `[face-gate] gemini_http_…` mehr, stattdessen `v252_aws_face_gate ok faces=1 …`.
4. Bewusst schlechte Szene (Rücken zur Kamera) → `code: "no_face"`, Refund läuft, kein Dispatch.

## Version-Tag
- `syncso-face-gate.ts` bumpt intern auf `v252-aws-face-gate-primary`.
- Deployt werden `compose-dialog-segments`, `report-lipsync-motion-probe` und jede Dispatcher-Function, die den Gate importiert — passiert bei Lovable-managed Functions automatisch beim Save.

## Was du tun musst
Nichts. Rekognition-Credentials (`AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` / `REKOGNITION_REGION`) sind bereits im Secret-Store und laufen produktiv für v156/v249. Plan freigeben, ich baue um.
