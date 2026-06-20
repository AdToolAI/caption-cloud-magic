# v148 — NOOP-Eskalation überstimmt Rule 0 (Preclip-Auto-Detect)

## Problem (aus den Logs verifiziert)

Scene `fcb2ee59` Pass 1:
1. Fresh-Dispatch: Preclip vorhanden → Rule 0 (v131.2) erzwingt `auto_detect:true` auf der per-Speaker Crop (variant `coords-pro` als Label, aber ASD ist auto_detect).
2. Sync.so liefert NOOP-suspect (`sync_output_reencoded_passthrough_suspect, sizeRatio=0.76`).
3. `sync-so-webhook` eskaliert via v134-Ladder → ruft `compose-dialog-segments` mit `noop_auto_escalation:true` + `noop_escalation_variant:"bbox-url-pro"`.
4. Aber `compose-dialog-segments` re-dispatcht **erneut mit Preclip + auto_detect**, weil:
   - `hasPassPreclipForDispatch === true` → `v147BboxEligible = false`
   - Rule 0 (v131.2) zwingt `auto_detect` unkonditional auf jeden Preclip-Pfad
   - Die requested `bbox-url-pro`-Variante wird durch den Preclip-Pfad ignoriert
5. NOOP wiederholt sich → Ladder erschöpft sich (2 Stufen) → Hard-Fail.

Resultat: Der UI-Hinweis "NOOP-Retry läuft (Stufe 1/2)" rotiert, aber `bbox-url-pro` feuert nie wirklich, weil der Preclip-Pfad ihn aushebelt.

## Fix (chirurgisch, in `compose-dialog-segments/index.ts`)

### A) NOOP-Eskalation droppt den Preclip-Pfad für den eskalierten Pass

Wenn `noop_auto_escalation === true` UND `noop_escalation_variant in ["bbox-url-pro", "coords-pro-box"]`:
- Behandle den Pass so, als ob **kein Preclip vorhanden** wäre (`hasPassPreclipForDispatch := false` lokal für die Dispatch-Entscheidung).
- Setze `retryVariant := noop_escalation_variant` (statt durch Rule 0 zu `coords-pro` mit auto_detect zu kollabieren).
- Bypass Rule 0 (v131.2) für diesen Pass; gehe direkt in den Full-Plate Deterministic-ASD-Pfad (analog v88 edge_speaker_skip_preclip, aber als generischer NOOP-Bypass).
- Strukturierter Log: `v148_noop_bypass_preclip step=<n> variant=<v> speaker=<name>`.

### B) v82-Gate erweitern

Das `v82-gate` Log emittiert auch im NOOP-Eskalations-Fall die Begründung (`gateReason = "v148-noop-bypass-bbox-url-pro"`), damit nachvollziehbar ist, warum jetzt Full-Plate gewählt wurde.

### C) Pre-Dispatch-Validation bleibt (v147)

Falls bbox-URL Upload failed oder `nonNullFrames === 0`, downgrade auf `coords-pro-box` (Stufe 1 der Ladder) — nicht zurück auf preclip-auto_detect. Wenn auch coords-pro-box invalid, regulärer Hard-Fail.

### D) Hardening: NOOP-Eskalation ist idempotent

`processed_attempt_ids` Check bleibt; doppelte Webhook-Lieferungen lösen die Eskalation nur einmal aus.

## Was NICHT geändert wird

- Fresh-Dispatch-Pfad (Pass 1): Rule 0 (auto_detect auf Preclip) bleibt unverändert. Nur die NOOP-Eskalation umgeht ihn.
- Single-Speaker-Pfad: unverändert (NOOP-Ladder wird dort eh nicht gezündet wie heute).
- Wire-Payload-Schema, sync-3 doc-strict Optionen, Refund-Pfade.
- v147 bleibt aktiv für Multi-Speaker-Szenen **ohne** Preclip-Path (Fresh-Dispatch).

## Validierungsplan

1. Multi-Speaker Szene mit Preclip auslösen, NOOP triggern (z.B. via lipsync-diagnostic Replay).
2. Logs prüfen:
   - `v148_noop_bypass_preclip step=1 variant=bbox-url-pro` muss erscheinen.
   - `v147_BBOX_URL_PRIMARY` (oder `v147_BBOX_DOWNGRADE_TO_COORDS_PRO`) muss bei der Eskalations-Re-Dispatch feuern.
   - `WIRE_PAYLOAD` muss `bounding_boxes_url` enthalten (kein `auto_detect`).
3. UI: "NOOP-Retry läuft (Stufe 1/2)" muss bei Erfolg zu COMPLETED gehen, nicht zu Hard-Fail.

## Doku

- Neue Datei: `mem/architecture/lipsync/v148-noop-bypass-preclip.md`
- Update: `mem/index.md` (verweis auf v148)
- Update: `mem/architecture/lipsync/v147-bbox-url-pro-only.md` (Querverweis auf v148)

## Risiken

- Full-Plate Multi-Face Sync.so-Dispatch via bounding_boxes_url ist getestet (v82 Phase 2.1, jetzt v147). Risiko hauptsächlich: nicht-resolvable plateIdentityMap → Pre-Dispatch-Validation greift und downgraded sauber.
- Kein Rollback der bestehenden Rule 0; sie wird nur in einem klar getaggten Fall (NOOP-Eskalation mit explizitem Variant) übergangen.
