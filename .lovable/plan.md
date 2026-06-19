## Befund

Punkt 2 (zwei sichtbare Szenen) ist normal: erst der generische Plate-Render, dann der character-anchored Plate, der den ersten ersetzt. Kein Bug, kein Fix nötig.

Punkt 1 (Lip-Sync) ist weiterhin kaputt. Die Live-Daten aus `syncso_dispatch_log` der gerade fehlgeschlagenen Szene zeigen exakt:

```text
FACE_GATE_PROBE_UNAVAILABLE   (server_extract_disabled_use_client_canvas)
↓
DISPATCHED  model=sync-3
  active_speaker_detection = { auto_detect:false, coordinates:[360,363], frame_number:52 }
  v102_probe.asd_mode = "v130_preclip_coord_strict"
↓
FAILED  http=200  error_class=other
  "Something went wrong while processing this generation. Please try again."
```

Bedeutet:
- `buildAsdStrategy()` mit Rule 0 ist im Code, aber im Live-Pfad fällt der Dispatch trotzdem in `preclip_coord_strict` (Rule 3) statt Rule 0 (`auto_detect:true`).
- `asd_mode_chosen` / `asd_rule_fired` / `preclip_trust` werden in `meta` immer noch nicht gesetzt (alle `nil`).
- Folge: Sync.so bekommt wieder `(coordinates, frame_number)` und antwortet mit dem bekannten `provider_unknown_error`.

Root cause am wahrscheinlichsten: In `compose-dialog-segments` läuft für Multi-Speaker (`isMultiSpeaker=true`) der Rule-3-Zweig, weil v131.1 Rule 0 nur bei `!isMultiSpeaker` ODER bei verifiziertem Single-Face-Crop greift. Bei dieser Szene sind 4 Sprecher → Rule 0 blockt → Rule 3 schickt strict coords → Sync.so kippt.

## Plan

### 1. Rule 0 auch für Multi-Speaker-Preclips zulassen, wenn der Preclip Single-Face ist
Der per-Speaker-Preclip ist per Konstruktion (v69) ein Single-Face-Square-Crop, auch wenn die Szene mehrere Sprecher hat. Das Multi-Speaker-Flag darf Rule 0 nicht mehr blockieren, solange:
- `usePreclip === true`
- `preclipTrust === "verified"` (Preclip wurde sauber generiert) ODER `preclipFaceCount === 1`
- `preclipAmbiguityRisk !== "neighbor_inside_crop"`
- kein expliziter `coords-pro` / `bbox-url-pro` Retry

In diesen Fällen: `{ auto_detect: true }`, keine `coordinates`, kein `frame_number`.

Multi-Speaker bleibt nur dann auf Rule 3 (strict coords) / Rule 2 (bbox), wenn der Preclip tatsächlich einen zweiten Sibling-Face im Crop hat (`neighbor_inside_crop`).

### 2. Diagnostics im Live-Pfad sicherstellen
`syncso_dispatch_log.meta` muss bei jedem Dispatch enthalten:
- `asd_mode_chosen`
- `asd_rule_fired`
- `preclip_trust`
- finales `outbound_payload.options.active_speaker_detection`

Aktuell sind diese Felder bei DISPATCHED-Zeilen `nil` — das Schreiben dieser Felder wird hart in den Pfad gezogen, damit man künftig sofort sieht, welche Rule gefeuert hat.

### 3. Sicherheitsnetz für `FACE_GATE_PROBE_UNAVAILABLE`
Wenn der Face-Probe `frame_probe_unavailable` zurückgibt, aber der Preclip eine gültige `preclip_url` ohne `preclip_error` hat, gilt `preclipTrust = "verified"` und Rule 0 greift. Das ist genau der Fall der fehlgeschlagenen Szene.

### 4. Verifikation
- Edge Function `compose-dialog-segments` deployen.
- Die fehlgeschlagene Hook-Szene über „Sauber neu starten“ neu lipsyncen.
- In `syncso_dispatch_log` prüfen:
  - `meta->>'asd_rule_fired'` beginnt mit `rule_0_`
  - `meta->'outbound_payload'->'options'->'active_speaker_detection'` = `{ "auto_detect": true }`
  - `coords` und `frame_number` sind `NULL`
  - `sync_status` = `COMPLETED` statt `FAILED`

## Technische Details (für später)

Dateien, die geändert werden:
- `supabase/functions/_shared/asd-strategy.ts` — Rule 0 Eligibility: `isMultiSpeaker` darf nicht mehr blockieren, solange Single-Face-Trust vorliegt.
- `supabase/functions/_shared/asd-strategy.test.ts` — neue Tests für Multi-Speaker + verified Preclip.
- `supabase/functions/compose-dialog-segments/index.ts` — beim `logSyncDispatch` für DISPATCHED/FAILED die `asd_mode_chosen`, `asd_rule_fired`, `preclip_trust` Top-Level in `meta` setzen.
- `mem/architecture/lipsync/v131-2-rule-0-multi-speaker-preclip.md` (neu) + Index-Update.

Keine Schemaänderungen, keine Auswirkungen auf andere Studios.