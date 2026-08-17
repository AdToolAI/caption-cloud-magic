# FA-4 — 4-Speaker Render + Read-only Audit (Szene 42bcdda1)

Genau ein kostenpflichtiger Render (~6,30 €) auf Szene `42bcdda1-3a42-4d2a-b43e-21f1888cd1f2`
(Projekt `035273d7…`, order_index 7, 6 Turns / 4 Sprecher / ~9 s Dialog, 15 s Plate).
Danach ausschliesslich lesende Verifikation — kein Retry, kein Reset, kein Cleanup.

## Ablauf

1. **Pre-Start-Snapshot (read-only)** direkt vor Confirm: `pipeline_state=idle`,
   `active_run_id=NULL`, alle Output-URLs NULL, Ledger-Jobs = 0.
2. **Start über die UI** (Playwright, User `info@useadtool.ai`): Render-Dialog öffnen,
   Kostenanzeige ablesen, genau einmal Confirm klicken.
3. **Sofort sichern**: `T_run_start` (UTC), `run_id`, erster Ledger-Job `plate_generation`.
4. **Verfolgen ohne Eingriff**: periodisches Polling von `composer_scenes` und
   `composer_pipeline_jobs` bis Terminalzustand. Keine UI-Aktion mehr.

## PASS-Kriterien (Ledger/DB-Nachweis)

- `compose-twoshot-audio` prägt genau 6 kanonische Turns in `dialog_turns`.
- Genau 4 stabile `speaker_idx` 0..3, bijektiv zu den 4 Characters; wiederkehrende
  Sprecher behalten ihren Index über beide Turns.
- Genau 6 `sync_segment`-Attempts, jeder Turn genau einmal, alle `attempt = 1`.
- Voice-Zuordnung pro Character korrekt (4 verschiedene ElevenLabs-Voices).
- Gruppenanker/Face-Mapping 4/4, Slots stabil; `reference_image_url` ist der
  tatsächliche v400-Geometrieanker (Plate-Messung auf derselben URL).
- Kein stiller Provider-Fallback (zertifiziert: HappyHorse / cinematic-sync).
- Genau 1 `audio_mux`, 1 realer `render_id`, 1 Stitch; keine Doppel-Dispatches.
- Finalisierung ausschliesslich über `composer_finalize_lipsync_scene(..., 'stitch:done')`,
  kein Legacy-Completion-Owner.
- `audio_mux = succeeded`, Szene `complete`, `processed_video_url` gesetzt,
  `resolveSceneOutput().source = 'processed'`, `isSceneOutputFinal() = true`.

## Visuelle Sichtung (zwingend)

Finalen Clip laden und stichprobenartig je Turn prüfen:
- nur der jeweils sprechende Character bewegt den Mund,
- keine falsche Voice auf einer Figur,
- keine springende Gesichts-/Slot-Zuordnung zwischen Turns.

## Abbruchregel

Bei der ersten relevanten Abweichung: **FA-4 P0/P1 — STOP**, Befund dokumentieren,
kein zweiter Versuch, kein Fix im selben Lauf.

## Dokumentation

Ergebnis (Snapshot, `T_run_start`, `run_id`, Ledger-Verlauf, Kriterien-Matrix,
visuelle Sichtung) in `docs/v433-motion-studio-final-acceptance.md` als Abschnitt FA-4.
