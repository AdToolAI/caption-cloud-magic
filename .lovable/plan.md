# v431 — A-Compatibility-Patch (temporär, wegen aktiver Legacy→State-Bridge)

Eng begrenzte Korrektur an genau einer Funktion: `composer_finalize_plate_scene` (RPC A).
Kein G3.2.2, keine Änderung an H, D, am Ledger, am Webhook-Code oder am Frontend.

## Warum

Heute akzeptiert A ausschließlich `plate_rendering` als From-State und transitioniert nach `plate_ready`.
Die aktive Legacy→State-Bridge kann die Szene aber schon auf `audio_prep`/`audio_ready` vorziehen, bevor
der Plate-Callback eintrifft. Der gültige Callback wird dann als `from_state_rejected` verworfen —
genau der Befund des Post-Deploy-Smokes.

## Geschlossene Compatibility-Matrix

| From-State | Outputs | State/Substate | Audit |
| --- | --- | --- | --- |
| `plate_rendering` | materialisiert | → `plate_ready` (echte Transition über den bestehenden Core) | wie heute, `applied = true` |
| `plate_ready` | materialisiert | unverändert | `from = to = plate_ready`, `result = compatibility_finalize` |
| `audio_prep` | materialisiert | unverändert | `from = to = audio_prep`, `result = compatibility_finalize` |
| `audio_ready` | materialisiert | unverändert | `from = to = audio_ready`, `result = compatibility_finalize` |
| alle übrigen (`lipsync_dispatched`, `lipsync_running`, `lipsync_muxing`, `complete`, `failed`, `canceled`, …) | keine | keine | `applied = false`, `reason = from_state_rejected` |

Kein Rückwärts-Transitionieren: bei den drei state-preserving Fällen wird `pipeline_state` und
`pipeline_substate` in der Update-Anweisung nicht angefasst.

## Unveränderte A-Invarianten (gelten in allen vier erlaubten Fällen)

- Vorgeschaltete Guards identisch: `write_id`, `stage = base_video`, Bindung an `external_job_id`,
  `run_id = active_run_id`, `plate_generation`, `duplicate_callback`, `attempt_superseded`, `base_url_required`.
- Atomarer Output-Write: `base_video_url`, `clip_url`, `clip_status = 'ready'`, `clip_error = NULL`,
  plus die bereits freigegebenen schmalen Felder (`continuity_rendered_source_clip_url`,
  `audio_plan.ambientGate`, Cinematic-Spiegel `lip_sync_status`/`twoshot_stage`).
- `processed_video_url` bleibt unberührt.
- Ledger-Job wird `succeeded` (im selben Row-Lock-Fenster).
- Post-Commit-Handoff im Webhook läuft nur bei `applied: true` — Webhook-Code bleibt unverändert.
- Duplicate-Callback danach: `duplicate_callback`, kein zweiter Write.

## Audit-Vertrag

Das bestehende Schema `composer_scene_transition_log` wird ohne Migration genutzt:
`from_state = to_state = aktueller State`, `applied = true`, `write_id = 'ccw:plate-complete'`,
`reason = 'compatibility_finalize'`, `guard_mode = 'run_bound'`, korrekte `run_id`/`generation`,
`caller_class = 'v2'`. Damit ist ein Compatibility-Finalize im Log eindeutig von einer echten
`plate_rendering → plate_ready`-Transition unterscheidbar und sieht nie wie `audio_ready → plate_ready` aus.

## Verifikation vor Redeploy

Transaktionaler DB-Smoke (Fixture-Projekt, vollständiger Cleanup):

1. `plate_rendering`, `plate_ready`, `audio_prep`, `audio_ready` → `applied = true`.
2. Bei den drei state-preserving Fällen: `pipeline_state` **und** `pipeline_substate` vorher/nachher exakt identisch.
3. `lipsync_dispatched`, `lipsync_running`, `complete` → `from_state_rejected` und vollständiger
   Row-Snapshot (alle Spalten) vorher/nachher identisch; Ledger-Job unverändert.
4. In allen erlaubten Fällen: Outputs korrekt gesetzt, `processed_video_url` unberührt, Job `succeeded`.
5. Direkt anschließender Duplicate-Callback → `duplicate_callback`, kein zweiter Write.
6. Audit-Zeilen je Fall geprüft (echte Transition vs. `compatibility_finalize` vs. Reject).

Statische Verifikation:

- Frozen-Command: `vitest run src/lib/composer src/lib/video-composer --testTimeout=60000` → `>= 540`, grün.
- `tsgo --noEmit` grün, `deno check` auf `supabase/functions/compose-clip-webhook` grün.

## Danach

Ergebnis in `docs/v431-g3-2-1-report.md` als Abschnitt „A-Compatibility-Patch" festschreiben,
Status auf `PATCHED / AWAITING REDEPLOY-GO` setzen → **STOP**. Kein Deploy ohne deine Freigabe.

## Technische Details

- Einzige geänderte Artefakte: eine Migration mit `CREATE OR REPLACE FUNCTION
  public.composer_finalize_plate_scene(...)` (Signatur unverändert, Grants unverändert) und der
  Smoke-Block. Kein TypeScript-Change.
- Implementierung: nach den Guards wird der aktuelle State gelesen. Bei `plate_rendering` läuft
  weiterhin `composer_scene_transition_core` mit Allowlist `['plate_rendering']`. Bei
  `plate_ready | audio_prep | audio_ready` wird der Core übersprungen und stattdessen die
  Compatibility-Audit-Zeile geschrieben; danach folgt in beiden Zweigen derselbe Output-/Ledger-Write.
  Alle übrigen States enden vor jeder Mutation mit `from_state_rejected` plus Reject-Audit.
- Die Matrix ist ausdrücklich temporär und wird nach G6 (Abbau der Legacy-Spiegel/Bridge) erneut
  auf Reduzierbarkeit geprüft; ein entsprechender Vermerk kommt in den Bericht.
