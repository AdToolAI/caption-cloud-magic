# v431 G2.2 — Abnahmebericht

Scope: Stale-Sicherheit für Output/Job-Slot-Bindung in `generate-talking-head`
und `report-lipsync-motion-probe`. Kein G2.3-Arbeitsanteil enthalten.

## 1. Primitive (DB)

| Primitive | Rolle |
| --- | --- |
| `composer_finalize_talking_head(_scene_id,_mode,_run_id,_generation,_write_id,…)` | Geschlossene Modi `start` / `complete` / `fail`. Feste From/To-Klassen, keine frei übergebbaren Zielstates. Schreibt Output-Tripel, kanonischen State und Legacy-Spiegel (`clip_status`, `clip_error`) unter demselben Row Lock. |
| `composer_fail_scene_with_mirrors(…)` | Hard-Fail für Motion-Probe: `pipeline_state=failed` + `pipeline_substate` + `clip_error` + `lip_sync_status` + `twoshot_stage` atomar. |
| `update_dialog_pass_slot` | Zusätzlich `job_id`-Immutability (neben `run_id`/`plate_generation`). |

Beide Primitive delegieren die Transition an `composer_scene_transition_core`
(`caller_class='v2'`): identische Zulässigkeitsprüfung gegen
`composer_scene_transitions` und identisches Audit (`write_id`, Run, Generation,
From/To, Ergebnis). Keine frei programmierten `UPDATE pipeline_state`.

## 2. Migrierte Writer

**`generate-talking-head`**
- Dispatch → `mode='start'` (idle/plate_queued → `plate_rendering`), inkl.
  Charakter-Metadaten, `replicate_prediction_id`, `mentioned_character_ids`.
- Poller-Erfolg → `mode='complete'` (nur aus `plate_rendering`).
- Refund-Fehler und Early-Fail → einziger Fehler-Writer `failSceneGuarded()`
  → `mode='fail'`.
- Fail-closed: ohne `runId` + `plateGeneration` kein Scene-Write; der
  Dispatch-Pfad antwortet zusätzlich mit `400 missing_run_provenance`.
- `materializeCompatibilityOutput` entfällt hier — Output wird ausschliesslich
  in der DB materialisiert.

**`report-lipsync-motion-probe`**
- Neues Gate vor jeder Auswertung: `payload.job_id` muss exakt der immutablen
  `job_id` des adressierten Pass-Slots entsprechen; sonst No-op
  (`ignored: job_slot_mismatch`).
- Hard-Fail → `composer_fail_scene_with_mirrors` mit Run-Snapshot aus dem Slot.
- Fehlender Slot-Run-Snapshot → kein Write, kein Legacy-Fallback.

## 3. Bewusst erhaltene Legacy-Spiegel (bis G6)

`clip_status`, `clip_error`, `lip_sync_status`, `twoshot_stage` — aktiv von
Hooks, UI und Webhooks gelesen. Sie werden nur noch innerhalb der geguardeten
Primitive geschrieben; kein zweites, ungeguardetes `.update()` nach der
Transition.

## 4. DB-Smokes (transaktional, vollständig zurückgerollt)

| # | Fall | Ergebnis |
| --- | --- | --- |
| S1 | `start` idle → plate_rendering | `applied`, `clip_status=generating` |
| S2 | Completion mit fremdem Run | `stale_run`, kein Write |
| S3 | Completion mit alter Generation | `stale_generation`, kein Write |
| S4 | `complete` | `plate_ready`, `clip_status=ready`, `clip_url=plate.mp4` |
| S5 | Zweiter Completion-Callback | `unexpected_from_state`, URL unverändert |
| S6 | Cancel-Race (canceled → complete) | `unexpected_from_state`, bleibt `canceled` |
| S7 | `fail` | `failed` + `clip_status=failed` + `clip_error` atomar |
| S8 | Probe-Hard-Fail | `failed` + `needs_clip_rerender` + `lip_sync_status=failed` + `twoshot_stage=needs_clip_rerender` atomar |
| S9 | Probe-Hard-Fail mit fremdem Run | `stale_run`, kein Write |
| S10 | Transition-Audit | 9 protokollierte Transitionen |

## 5. Statische Verifikation

- `tsgo --noEmit`: grün.
- Composer-/Lip-Sync-Suite: 482 Tests grün. Writer-Inventar-Test um die Klasse
  „atomic DB writers" erweitert (RPC vorhanden, keine direkten
  Output-Spalten-Zuweisungen).
- Verbleibende Rot-Tests: `src/pages/__tests__/Composer.test.tsx`
  (Social-Publishing-Integration) — vorbestehend und ausserhalb dieses Scopes.

## 6. Status

G2.2 abgeschlossen. STOP vor G2.3.
