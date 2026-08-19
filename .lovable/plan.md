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

- `buildProviderWireSnapshot(input)` → normalisiertes Snapshot-Objekt mit exakt:
  `video_url`, `audio_url` (der tatsächlich gesendete `sync_audio_url ?? audio_url`), `bbox` (transformierte Contract-E-Box), `frame_count`, `voiced_windows`, `sync_mode`, `model`, `speaker_idx`, `segment_id`, `run_id`, `plate_generation`.
- `buildProviderWire(snapshot, { asdTransport: "url" | "inline", boundingBoxesUrl?, boundingBoxes? })` → konkretes Wire-Objekt. Diese Funktion wird vom Produktionspfad tatsächlich als Quelle für den Audio-/Video-/ASD-Teil des Payloads verwendet, damit der Test keinen Parallelpfad prüft.
- `resolveFrozenProviderInput(pass)` → Snapshot oder `null`.

Persistenz: unmittelbar vor dem Sync.so-Dispatch wird der Snapshot als `pass.provider_input_frozen` in den Pass-Slot geschrieben (gleicher Persist-Pfad wie die bestehenden `_v105_probe`/Preclip-Felder, keine neue Tabelle, keine Migration).

## 2. NOOP Retry reuse

Bedingung: `isFrozenNoopRetryPass(pass)` bzw. `noop_auto_escalation === true` mit `retry_variant ∈ {coords-pro-box, bbox-url-pro}` UND vorhandenem `provider_input_frozen.audio_url`.

Dann strukturell übersprungen (Branch vor der jeweiligen Stelle, nicht danach):
- v40 Canonical-Restore (`audio_url` bleibt, `audio_tight` wird nicht genullt),
- Tight-Slicing inkl. Upload (`Date.now()`-Pfad wird nicht betreten),
- v129.3-Trim/Upload — `sync_audio_url` wird direkt aus dem Snapshot gesetzt.

Ebenfalls aus dem Snapshot übernommen statt neu berechnet: Preclip-/Video-URL, Contract-E-Box, Frame-Count, Voiced-Windows, `sync_mode`, `model`, `speaker_idx`, `segment_id`, `run_id`, `plate_generation`.
Einziger Unterschied auf dem Wire: `bounding_boxes_url` (fresh) → inline `bounding_boxes` (retry).
Fehlt der Snapshot, bleibt exakt das heutige Verhalten (kein neuer Fail-Pfad). Nicht-NOOP-Retries bleiben unverändert.

## 3. Tests

- **Matrix H — Actual Wire Parity**: realistischer Multi-Speaker-Pass, `freshWire` und `retryWire` über `buildProviderWire` erzeugen, Deep-Equality über alle Felder außer `active_speaker_detection`; zusätzlich einzelne Asserts für `audio_url`, `video_url`, `bbox`, `frame_count`, `voiced_windows`, `sync_mode`, `model`, `speaker_idx`, `segment_id`, `run_id`, `plate_generation`. ASD fresh `{auto_detect:false, bounding_boxes_url}` vs. retry `{auto_detect:false, bounding_boxes:[...]}`.
- **No-Date-Now-Rebuild**: Prädikat-Test, dass der Tight-Audio-/Normalisierungspfad bei vorhandenem frozen Input nicht betreten wird (kein neuer `*-tight-<ts>.wav`).
- Re-Run: Matrix B–M, Deadline-Tests, Classifier, Plate-Face-Frozen-Tests.

## 4. Version

`COMPOSE_DIALOG_SEGMENTS_VERSION` → `v406-fa4-noop-retry-wire-parity-final`. Kein Deploy.

## Gate

Bei bewiesener Parität inkl. Audio: `FA-4 v406 RETRY-WIRE PARITY CORRECTION = PASS — READY FOR PRE-DEPLOY REVIEW → STOP`, sonst `BLOCKED — <Grund> → STOP`.
