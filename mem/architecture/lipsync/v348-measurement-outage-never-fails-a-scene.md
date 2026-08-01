---
name: v348 — Messausfall darf keine Szene killen
description: Mux-Gate blockt nur noch `static`; AWS-Still-Probe sendet Remotion-`version` und volle Lambda-Forensik
type: constraint
---

# v348 (aktuell)

## Regeln

1. **Mux-Gate (`render-sync-segments-audio-mux`)**
   - `static` (gemessene Bewegungslosigkeit) → blockt hart, `provider_returned_static_output`.
   - `unknown`/fehlend (eigene Messung ausgefallen) → **blockt nicht**. Szene wird gemuxt, Pass wird als
     `motion_unverified` geloggt. Der Fehlercode `motion_verdict_unavailable` existiert nicht mehr.
   - Begründung: v344–v347 haben jeden Messausfall in einen Kundenfehler
     („Mundbewegung konnte nicht serverseitig bestätigt werden") verwandelt und damit
     funktionierende Lip-Syncs verworfen.

2. **AWS-Still-Probe (`_shared/aws-frame-probe.ts`)**
   - Payload muss `version: REMOTION_STILL_VERSION` (= Lambda-Version, aktuell 4.0.462) enthalten;
     ohne dieses Feld antwortet das Remotion-Lambda mit leerem Body → v347-Symptom
     `unparsable_lambda_body:` ohne Detail.
   - Jede nicht verwertbare Antwort wird mit `status`, `x-amz-function-error`, `x-amzn-requestid`
     und Bodylänge geloggt.
   - Fallback: deterministische öffentliche S3-URL (`bucket/outName`) per HEAD prüfen.
   - AWS-only bleibt Pflicht: kein Replicate, kein lucataco (Guard-Test).
