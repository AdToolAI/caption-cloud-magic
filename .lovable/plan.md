# v431 G3.2.2-F1.IMP — Atomic Stitch Finalizer + audio_mux Narrow Patch

## Antworten auf die zwei Gate-Fragen

**1. Finalizer-Signatur & State-Matrix: ja, im Contract festgezurrt.**
`docs/v431-g3-2-2-f1-contract.md` §5.2 definiert Inputs (`_pipeline_job_id`, `_external_job_id`, `_scene_id`, `_final_url`, `_write_id`), die 8 Schritte des atomaren Ablaufs sowie §6 die vollständige Race-/Duplicate-Matrix inkl. Return-Verhalten (`already_completed`, `wrong_job`, `stale_run`, `stale_generation`, `canceled`). Die Implementierung erfindet nichts — sie setzt §5.2 + §6 1:1 um. Einzige Präzisierung, die die Implementierung noch braucht (unten in Abschnitt „Technisches“ fixiert): das konkrete JSONB-Return-Format.

**2. Provenienztransport bis `dialog-stitch`: bereits vorhanden, kein zusätzlicher Transport nötig.**
Verifiziert im Code: `render-sync-segments-audio-mux` schreibt `customData.pipeline_job_id = v431MuxLedgerJobId` beim Lambda-Dispatch, `remotion-webhook` liest `customData.pipeline_job_id` und hat es im `isDialogStitch`-Branch verfügbar. Es wird heute nur nicht *verwendet* (keine Ledger-Terminalisierung, keine RPC). Der nächste Schritt ist damit **Finalizer + narrow patch + Writer-Migration**, kein Provenienz-Transportfix.
Einzige Absicherung: der Transport ist heute konditional (`...(v431MuxLedgerJobId ? {...} : {})`). Für den Fall „kein Ledger-Job“ bleibt der Legacy-Pfad als expliziter, geloggter Fallback bestehen.

## Was gebaut wird

1. **Neue RPC `composer_finalize_lipsync_scene`** (Migration) — alleiniger atomarer Owner der Stitch-Terminalisierung, exakt nach Contract §5.2 mit der Matrix aus §6. Ledger-Job → `succeeded` und Scene → `complete` in einer Transaktion, Audit-Eintrag `f1:stitch:done`.
2. **`render-sync-segments-audio-mux` narrow patch** — `audio_mux` wird gemerged statt ersetzt, damit `mux_dispatch_requested_at` erhalten bleibt (Contract §7.1). Sonst keine Änderung an dieser Funktion.
3. **`remotion-webhook` Stitch-Writer-Migration** — der `isDialogStitch`-Erfolgszweig ruft die RPC auf statt direkt `composer_scenes` zu updaten. Fehlt `pipeline_job_id` oder liefert die RPC `no_ledger_job`, greift der bisherige Legacy-Update als markierter Fallback (mit Warn-Log), damit kein Lauf hängen bleibt.
4. **Tests** — Unit/Contract-Tests für die Matrix (first success, duplicate, wrong external job, stale run/generation, canceled) plus ein Merge-Test für `audio_mux`.
5. **STOP vor Deploy** — Report mit Diff-Übersicht und Testergebnissen, dann Review.

## Technisches

**RPC-Signatur (final):**
```sql
composer_finalize_lipsync_scene(
  _pipeline_job_id uuid,
  _external_job_id text,
  _scene_id uuid,
  _final_url text,
  _write_id text  -- Allowlist: exakt 'stitch:done', sonst Reject 'invalid_write_id'
) RETURNS jsonb
```
Return immer `{ "verdict": <text>, "scene_id": uuid, "pipeline_job_id": uuid }`, verdict ∈
`finalized | already_completed | wrong_job | wrong_stage | stale_run | stale_generation | canceled | pre_reset_attempt | invalid_write_id | no_ledger_job`.
Nur `finalized` mutiert die Szene. `already_completed` ist ein Erfolgsfall für den Aufrufer (HTTP 200, keine Retry-Schleife). Alle Reject-Verdicts sind non-fatal für den Webhook (200, kein Lambda-Retry), werden aber in `composer_callback_observations` protokolliert.

ACL: `REVOKE ALL FROM public/anon/authenticated`, `GRANT EXECUTE TO service_role` (analog `composer_apply_sync_segment_result`).

**Ledger From-State-Matrix (geschlossen, keine „Äquivalente"):**
Reale Statuswerte in `composer_pipeline_jobs`: `pending`, `dispatching`, `dispatched`, `dispatch_uncertain`, `succeeded`, `failed`, `stale`, `cancelled`. Der `audio_mux`-Job wird von `bindLedgerExternalJob` auf `dispatched` gesetzt und bleibt es bis zum Stitch-Callback — es gibt keinen `bound`- oder `callback_processing`-Status.

| From-State | Verdict |
|---|---|
| `dispatched` | `finalized` (einziger Erfolgsübergang → `succeeded`) |
| `dispatch_uncertain` | `finalized`, sofern `external_job_id` exakt passt (Dispatch war real erfolgreich); sonst `wrong_job` |
| `succeeded` | `already_completed`, keine Mutation |
| `pending` / `dispatching` | `wrong_job` (Callback vor Bind — Provenienzfehler) |
| `failed` / `stale` | `stale_run` bzw. `wrong_job` je nach `replaced_by` |
| `cancelled` | `canceled`, keine Mutation |

**Scene-Ausgangsstati und RS3-Epoch-Logik:**
- `active_run_id` und `plate_generation` müssen zum Ledger-Job passen, sonst `stale_run` / `stale_generation`.
- `lip_sync_status = 'canceled'` → `canceled`, keine Mutation.
- RS3-Marker (`audio_plan.twoshot.rs3_reset`) wird **epoch-aware** ausgewertet, nie als pauschaler Cancel:
  - kein Marker → normale Prüfung;
  - Marker vorhanden und `job.metadata.rs3_reset_id` = aktueller `rs3_reset_id` → normal weiter (Post-Reset-Lauf darf finalisieren);
  - Marker vorhanden und Job trägt eine andere/keine `rs3_reset_id` → `pre_reset_attempt`, keine Mutation.
  Das ist dieselbe Fence-Logik wie in `composer_rs3_fence_verdict` / `composer_rs3_is_pre_reset_attempt` und wird von dort wiederverwendet statt neu formuliert.

**Provenienz — kein generischer Legacy-Fallback:**
Im `isDialogStitch`-Erfolgszweig gilt ausschließlich:
- `pipeline_job_id` vorhanden → atomarer Finalizer, dessen Verdict entscheidet;
- `pipeline_job_id` fehlt → Observation `missing_pipeline_job_id`, **keine** Scene-Mutation, Fall geht an Recovery;
- Ledger-Zeile fehlt → `no_ledger_job`, **keine** Legacy-Finalisierung.
Der bisherige Direct-Update wird für diesen Pfad entfernt. Ein Legacy-Zweig bleibt nur bestehen, wenn ein Callback nachweislich zu einem Pre-Ledger-Grandfather-Typ gehört (Callback ohne `customData.stage = 'sync_segments_audio_mux'` und ohne Ledger-Historie); dieser Zweig wird explizit als Grandfather markiert und geloggt, nicht als Sicherheitsgurt für aktuelle Stitch-Callbacks verwendet.


**Berührte Dateien:**
- neue Migration (RPC + Grants)
- `supabase/functions/render-sync-segments-audio-mux/index.ts` (nur der `audio_mux`-Objektaufbau)
- `supabase/functions/remotion-webhook/index.ts` (nur der `isDialogStitch`-Erfolgszweig)
- Tests unter dem bestehenden v431-Testverzeichnis

Kein anderer Lip-Sync-Writer, kein Plate-Pfad, kein Dialog-Segment-Pfad wird angefasst (Contract §9).
