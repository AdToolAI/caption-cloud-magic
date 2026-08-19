# FA-4 v406 — Retry-Wire Parity Correction (Code + Tests only)

Bestätigter Befund (read-only): Auf einem NOOP-Retry läuft in `compose-dialog-segments/index.ts` weiterhin
(a) der v40-Restore (`audio_url_full → pass.audio_url`, `audio_tight = null`, ~Z. 5047–5059),
(b) das Tight-Slicing mit `...-tight-${Date.now()}.wav` (~Z. 5290–5325),
(c) die v129.3-Normalisierung, die `sync_audio_url` neu erzeugt (~Z. 6470+).
Der Provider-Audio-Input (`payload.input[type=audio].url = sync_audio_url ?? audio_url`, ~Z. 6859) ist damit auf dem Retry eine andere URL als beim Fresh-Dispatch.

## Scope

Nur dieser P1 + echter Wire-Parity-Test. Kein Deploy, kein Render, keine Migration, keine Geometrie-, Threshold-, Measurement-, Mux- oder RS3-Änderung. P1-A/B/C bleiben unverändert.

## 1. Frozen Provider Input Snapshot

Neuer PURE Helper `supabase/functions/_shared/provider-wire-snapshot.ts`:

- `buildProviderWireSnapshot(input)` → normalisiertes Snapshot-Objekt mit exakt diesen Feldern, jedes genau einmal:
  `video_url`, `audio_url` (der tatsächlich gesendete `sync_audio_url ?? audio_url`), `bbox` (transformierte Contract-E-Box), `bounding_boxes` (kanonisches Box-Array), `frame_count`, `dispatch_fps`, `voiced_windows`, `sync_mode`, `model`, `speaker_idx`, `segment_id`, `run_id`, `plate_generation`. Kein zweites Frame-Count-Feld, kein Alias.
- `buildProviderWire(snapshot, { asdTransport: "url" | "inline", boundingBoxesUrl? })` → konkretes Wire-Objekt. Diese Funktion ist die EINZIGE Production-Quelle für alle frozen Wire-Felder: nach dem Aufruf werden `video_url`, `audio_url`, `model`, `sync_mode`, ASD, `bbox`/`bounding_boxes` sowie `frame_count`/`dispatch_fps` (soweit sie den Wire beeinflussen) nicht mehr überschrieben oder neu berechnet. Der Payload, der an Sync.so geht, wird aus diesem Objekt gebildet — kein Parallel-/Mirror-Payload.
- `resolveFrozenProviderInput(pass)` → vollständiger Snapshot oder `null` (unvollständig ⇒ `null`).


Box-Sequenz wird genau einmal berechnet und eingefroren:
- Fresh: frozen `bounding_boxes` → JSON-Upload → `bounding_boxes_url`.
- Retry: EXAKT dasselbe frozen `bounding_boxes` → inline `bounding_boxes`. Keine Neuberechnung auf einer der beiden Seiten.

## 1b. Snapshot-Persistenz ist verbindlich (kein best-effort)

Der Snapshot entsteht erst, wenn alle Felder endgültig feststehen (dispatch video URL, provider audio URL, Contract-E dispatch bbox, bounding_boxes, frame_count, dispatch_fps, voiced_windows, sync_mode, model, speaker_idx, segment_id, run_id, plate_generation).

Danach `update_dialog_pass_slot(provider_input_frozen)` — dieser Write MUSS erfolgreich sein, bevor Sync.so `/generate` aufgerufen wird. Persist-Fehler ⇒ fail closed über den bestehenden `failBeforeProviderDispatch`-Pfad mit `provider_call_made=false`, kein Provider-Call, bestehende Refund-Idempotenz unverändert.

## 1c. Snapshot-Reihenfolge (Fresh)

1. final video bestimmen → 2. final provider audio → 3. Contract-E bbox → 4. canonical `bounding_boxes` EINMAL erzeugen → 5. `frame_count`/`dispatch_fps`/`voiced_windows` → 6. model/`sync_mode`/provenance → 7. `buildProviderWireSnapshot(...)` → 8. `update_dialog_pass_slot(provider_input_frozen)` → 9. Persist-Erfolg zwingend bestätigen → 10. Bounding-Box-JSON AUS `frozen.bounding_boxes` hochladen → 11. `buildProviderWire(snapshot, asdTransport:"url")` → 12. Dispatch.

## 2. NOOP Retry reuse

Gate ist ausschließlich `const frozenInput = resolveFrozenProviderInput(pass)`. Nur bei `frozenInput !== null` darf der NOOP-Retry dispatchen; ein unvollständiger Snapshot zählt wie ein fehlender: fail closed mit `reason = noop_retry_frozen_input_missing`, `provider_call_made = false`, ZERO Sync.so-Calls, KEIN Legacy-Rebuild. Kein Gating auf ein Einzelfeld wie `provider_input_frozen.audio_url`.

Retry-Reihenfolge: 1. `resolveFrozenProviderInput(pass)` → 2. fehlt/unvollständig ⇒ fail closed → 3. KEIN v40-Restore → 4. KEIN Tight-Slicing → 5. KEINE v129.3-Normalisierung → 6. KEIN Video-/BBox-/Box-Recompute → 7. `buildProviderWire(snapshot, asdTransport:"inline")` → 8. Dispatch.

Strukturell übersprungen (Branch vor der jeweiligen Stelle, nicht danach):
- v40 Canonical-Restore (`audio_url` bleibt, `audio_tight` wird nicht genullt),
- Tight-Slicing inkl. Upload (`Date.now()`-Pfad wird nicht betreten),
- v129.3-Trim/Upload — `sync_audio_url` kommt direkt aus dem Snapshot,
- Video-Rehost/-Recompute und bbox-/bounding_boxes-Recompute.

Frozen Invariante: fresh und retry teilen `video_url`, `audio_url`, `bbox`, canonical `bounding_boxes`, `frame_count`, `dispatch_fps`, `voiced_windows`, `sync_mode`, `model`, `speaker_idx`, `segment_id`, `run_id`, `plate_generation`. Einziger fachlicher Unterschied: ASD-Transport — fresh `{auto_detect:false, bounding_boxes_url:<JSON-Inhalt == frozen.bounding_boxes>}`, retry `{auto_detect:false, bounding_boxes: frozen.bounding_boxes}`. Nicht-NOOP-Retries und Fresh-Dispatches bleiben unverändert.



## 3. Tests

- **Matrix H — Actual Wire Parity**: realistischer Multi-Speaker-Pass, `freshWire` und `retryWire` über `buildProviderWire` erzeugen, Deep-Equality über alle Felder außer `active_speaker_detection`; zusätzlich einzelne Asserts für `audio_url`, `video_url`, `bbox`, `frame_count`, `dispatch_fps`, `voiced_windows`, `sync_mode`, `model`, `speaker_idx`, `segment_id`, `run_id`, `plate_generation`. ASD fresh `{auto_detect:false, bounding_boxes_url}` vs. retry `{auto_detect:false, bounding_boxes:[...]}`.
- **Box-Sequenz-Parität**: Inhalt des beim Fresh hochgeladenen bounding-box-JSON deep-equals dem inline `bounding_boxes` des Retry.
- **No-Date-Now-Rebuild**: Prädikat-Test, dass der Tight-Audio-/Normalisierungspfad bei vorhandenem frozen Input nicht betreten wird (kein neuer `*-tight-<ts>.wav`).
- **Snapshot-Persist-Failure**: Persist schlägt fehl ⇒ zero provider calls, `provider_call_made=false`.
- **Missing snapshot on NOOP retry**: unvollständiger/fehlender Snapshot ⇒ zero provider calls, kein Legacy-Rebuild.
- Re-Run: Matrix B–M, Deadline-Tests, Classifier, Plate-Face-Frozen-Tests.

## 4. Version

`COMPOSE_DIALOG_SEGMENTS_VERSION` → `v406-fa4-noop-retry-wire-parity-final`. Kein Deploy.

## Gate

Bei bewiesener Parität inkl. Audio: `FA-4 v406 RETRY-WIRE PARITY CORRECTION = PASS — READY FOR PRE-DEPLOY REVIEW → STOP`, sonst `BLOCKED — <Grund> → STOP`.
