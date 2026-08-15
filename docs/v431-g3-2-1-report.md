# v431 G3.2.1 — Callback-Apply-Migration `compose-clip-webhook`

Status: **GATES 1–3 PASS / NOT DEPLOYED**
Stand: 2026-08-15, vor Deploy-Freigabe. Kein G3.2.2.

## 1. Scope

Migrierte Schreibpfade in `supabase/functions/compose-clip-webhook/index.ts`:

| Pfad | Neuer Writer |
| --- | --- |
| Plate-Erfolg | RPC A `composer_finalize_plate_scene` |
| Handoff-Fehler nach erfolgreicher Plate | RPC H `composer_fail_post_plate_handoff` |
| `ccw:failed` | RPC D `composer_fail_callback_scene` |
| `ccw:legacy_route_blocked` | RPC D `composer_fail_callback_scene` |

Alle drei RPCs: `SECURITY DEFINER`, `REVOKE ALL` von PUBLIC/anon/authenticated, `GRANT EXECUTE` nur `service_role`, Guards unter Job- und Scene-Row-Lock, Prüfreihenfolge `binding_pending` vor External-ID-Vergleich, Terminal-Success = `succeeded`.

## 2. Freigegebene Vertragsabweichungen

1. **`_base_video_url` → `_base_url`** (Signatur/Konvention, keine Semantikänderung). Notwendig, weil der eingefrorene Output-Writer-Test direkte `base_video_url:`-Zuweisungen im Function-Code verbietet; die Konvention entspricht `composer_finalize_talking_head`.
2. **H-From-States erweitert** auf eine **geschlossene** Matrix `plate_ready | audio_prep | audio_ready`. Grund: Die aktive Legacy→State-Bridge hebt eine materialisierte Cinematic-Sync-Plate unmittelbar aus `plate_ready` heraus; mit `plate_ready`-only hätte H faktisch nie gegriffen. Kein generelles „spätere States dürfen failen" — Nachweis siehe Gate 1.

## 3. Gate 1 — H-Compatibility-Matrix (Smoke S9)

Sechs frische Szenen-Zyklen in einem Fixture-Projekt, jeweils mit materialisierter Plate (`clip_url`/`base_video_url` gesetzt, `clip_status = ready`, `dialog_shots` befüllt) und `succeeded`-Plate-Ledger-Job. Fixtures danach vollständig gelöscht (verifiziert: 0 Restzeilen).

| From-State | Ergebnis | Verdikt |
| --- | --- | --- |
| `plate_ready` | `applied = true`, State `failed`, Spiegel `lip_sync_status/twoshot_stage = failed` | erlaubt |
| `audio_prep` | `applied = true` | erlaubt |
| `audio_ready` | `applied = true` | erlaubt |
| `lipsync_dispatched` | `applied = false` | `from_state_rejected` |
| `lipsync_running` | `applied = false` | `from_state_rejected` |
| `complete` | `applied = false` | `from_state_rejected` |

Zusätzlich in **allen sechs** Fällen bewiesen:

- **Output-Invarianz:** `base_video_url`, `clip_url`, `processed_video_url`, `clip_status`, `dialog_shots` unverändert. H ändert ausschließlich State/Substate und die Lip-Sync-Spiegel.
- **Audit-Vertrag erlaubt:** genau eine neue Zeile in `composer_scene_transition_log` mit `applied = true`, `write_id = ccw:handoff_failed`, korrektem `run_id` + `generation = 11`, `to_state = failed`, `guard_mode = run_bound`.
- **Audit-Vertrag abgelehnt:** Zeile mit `applied = false` und gesetztem `reason`; der vollständige Scene-Row-Snapshot (ohne `updated_at`) ist vor/nach byte-identisch — `from_state_rejected` erzeugt **keine** Scene-Mutation.
- **Ledger unberührt:** Plate-Job bleibt in allen sechs Fällen `succeeded`.

Damit sind die drei erlaubten From-States abschließend aufgezählt.

Frühere Smokes S1–S8 (Identitäts-Guards, Happy-Path, `duplicate_callback`, `attempt_superseded`, Write-ID-Allowlist) bleiben gültig.

## 4. Gate 2 — Frozen-Suite

Exakt der eingefrorene G3.1d-Command:

```text
vitest run src/lib/composer src/lib/video-composer --testTimeout=60000
```

Ergebnis: **48 Dateien / 540 Tests grün**, 0 rot — identisch zur G3.1d-Baseline 540/540.

Beleg zu den acht Deno-Dateien: `vitest list src/lib/composer src/lib/video-composer --filesOnly` liefert 48 Dateien, davon **0** unter `supabase/functions/`. Die acht `supabase/functions/_shared/*.test.ts` waren daher nie Teil der 527-/536-/540er-Baseline; sie sind reine Deno-Dateien mit `https:`-Importen und unter Vitest generell nicht lauffähig. Der zusätzliche Lauf über `supabase/functions/_shared` aus dem vorherigen Turn ist **nicht** Baseline und wird nicht als solche gewertet.

Der Writer-Inventar-Test `materializeSceneOutput.test.ts` wurde nicht entfernt, sondern inhaltlich umgehängt: `compose-clip-webhook/index.ts` steht jetzt in `ATOMIC_DB_WRITERS` (RPC `composer_finalize_plate_scene`, keine direkten Output-Spalten, kein `materializeCompatibilityOutput`) statt in `FINALIZATION_POINTS`. Testanzahl unverändert.

## 5. Gate 3 — Out-of-Scope-Änderungen

Nach der Typ-Regenerierung blockierten acht Buildfehler den Turn; sie sind nicht durch G3.2.1 verursacht.

1. **`src/pages/TeamWorkspace.tsx` zurückgesetzt.** Die Umstellung `approver_id/approved_at → reviewed_by/reviewed_at` ist rückgenommen; der ursprüngliche Payload ist wiederhergestellt und nur typseitig über `as never` entschärft. Laufzeitverhalten exakt Pre-G3.2.1 (Emit-Vergleich identisch).
2. **Reine Payload-Casts bleiben** in `FaceMapReviewDialog.tsx`, `SceneCard.tsx` (×2), `useAudiobookProject.ts`, `useSceneGenerate.ts`, `useMotionStudioLibrary.ts` (×2). Emit-Vergleich (esbuild, Original ohne Casts vs. geänderte Datei): **alle identisch**; bei `FaceMapReviewDialog.tsx` unterschied sich nur der aus dem Temp-Dateinamen abgeleitete Bezeichner des Default-Exports, nach Normalisierung ebenfalls byte-identisch.
3. **Kein Frontend-Deploy** wegen dieser Dateien. Deployt wird ausschließlich die Edge-Function.

### Offene Schuld (nicht behoben)

- **`content_approvals`-Spaltenfehler:** `src/pages/TeamWorkspace.tsx` schreibt `approver_id` und `approved_at`; die Tabelle hat `reviewed_by` und `reviewed_at`. Der Approval-Entscheid dürfte damit zur Laufzeit fehlschlagen. Bewusst **nicht** in diesem Deploy korrigiert, nur typseitig ruhiggestellt. Separater Vorgang, separate Freigabe.
- **Restschuld A (aus G3.1c):** `watchdog_no_prediction_id` vor erstem Provider-Callback — weiterhin offen.

## 6. Verifikation gesamt

| Prüfung | Ergebnis |
| --- | --- |
| Smokes S1–S8 (Identität/Apply/Fail) | grün |
| Smoke S9 (H-Matrix, 3 erlaubt / 3 verboten) | grün |
| Frozen-Suite (eingefrorener Command) | 540/540 grün |
| `tsgo --noEmit -p tsconfig.app.json` | sauber |
| `deno check compose-clip-webhook` | nur vorbestehender Fehler `_shared/ambient-audio.ts:83` (`Uint8Array`/`BlobPart`), unverändert |
| Emit-Vergleich Out-of-Scope-Casts | identisch |

## 7. Status

- **G3.2.1: GATES PASS / NOT DEPLOYED** — wartet auf Deploy-GO für ausschließlich `compose-clip-webhook`.
- RPCs A/H/D sind live, service-role-only und vom noch nicht deployten Handler ungenutzt → kein Rollback nötig.
- **G3.2.2 gesperrt.**

---

# Post-Deploy-Smoke (Plate-Callback)

Status: **DEPLOYED / POST-DEPLOY-SMOKE FAIL — APPLY BLOCKIERT**
Keine Reparatur in diesem Schritt (Plan-Scope). STOP zur Abnahme.

## Deploy

- Deployt: **ausschließlich** `compose-clip-webhook`. Kein Frontend-Deploy, keine weitere Function, keine Migration.
- `T_deploy = 2026-08-15T13:50:26Z`.

## Lauf-Identität (vollständig nach T_deploy)

| Feld | Wert |
| --- | --- |
| Projekt | `04b80fab-090d-4108-a734-63e651c1b41c` |
| Szene | `34d223fd-405c-4179-a6b5-ed6b0c7a61ab` (S2) |
| `run_id` | `5811c009-444e-4a60-98d2-93a59c7f43db` |
| `plate_generation` | 2 |
| Ledger-Job | `0f8cb822-eb53-4c11-8f65-e61e733b5c79`, Stage `base_video`, Provider `ai-happyhorse` |
| Start (UI, echter Render, 630 Cr) | 13:58:00Z |

## Gate-Ergebnisse

| Gate | Erwartung | Ist | Verdikt |
| --- | --- | --- | --- |
| Ledger-Bindung | Attempt 1, external ID gebunden, gen passend | Attempt 1, `external_job_id = c80763f69drmt0d00pvrwf4e5w`, `plate_generation = 2`, Status `dispatched` | PASS |
| Observe | `bound` | 1 Event, `compose-clip-webhook` / `base_video` / **`bound`**, 14:01:18Z | PASS |
| `binding_pending`/409-Serie | keine | keine | PASS |
| Apply über A | `applied = true` | **`applied = false`, `reason = unexpected_from_state`**, `write_id = ccw:plate-complete`, 14:01:20Z | **FAIL** |
| Ledger-Abschluss | Job → `succeeded` | Job bleibt `dispatched`, `completed_at = NULL` | **FAIL** (Folge) |
| Scene-State | `plate_ready` bzw. legitimer Bridge-Folgezustand | `audio_ready` (unverändert) | **FAIL** (Folge) |
| `base_video_url` / `clip_url` | gesetzt | beide `NULL`, `clip_status = generating` | **FAIL** (Folge) |
| `processed_video_url` | unberührt | `NULL` — unberührt | PASS |
| Duplicate-Callback | No-op | nicht real beobachtet (kein zweiter Provider-Callback); es gilt weiterhin nur Smoke S7 | NICHT BEOBACHTET |
| H (Handoff-Failure) | nur innerhalb der Matrix | real nicht eingetreten | NICHT BEOBACHTET |

## Befund

Der Provider-Callback kam korrekt an, die Identitätsprüfung war vollständig sauber (`bound`, richtige Job-/Run-/Generation-Bindung, keine 409-Serie). Der Fehler liegt **nach** der Identität, in der From-State-Zulassung von RPC A:

Zum Callback-Zeitpunkt stand die Szene auf **`audio_ready`**, nicht auf einem von A akzeptierten Vorzustand. Die Audio-Prep-Bridge hatte die Szene bereits um 13:58:53Z von `plate_queued` nach `audio_ready` weitergeschoben, **während** die Plate beim Provider noch lief. A hat den Apply damit vertragsgemäß fail-closed abgelehnt (`unexpected_from_state`) und keinerlei Scene-Mutation vorgenommen.

Das ist exakt dasselbe Bridge-Verhalten, das in Gate 1 zur Erweiterung der **H**-From-States auf `plate_ready | audio_prep | audio_ready` geführt hatte. Diese Erweiterung wurde bei **A** nicht mitgezogen — A ist gegen eine Vorzustandsmenge geschnitten, die die aktive Bridge im Realbetrieb überholt.

Fachliche Folge: Ein erfolgreicher Provider-Clip geht nicht verloren (Provider-Ergebnis existiert), wird aber nicht materialisiert; der Ledger-Job bleibt gebunden offen und fällt in die Reaper-/Watchdog-Zuständigkeit.

Bewertung: **kein Identitäts-, Ledger- oder Observe-Defekt** — G3.1 trägt unverändert. Der Defekt sitzt allein in der From-State-Matrix von RPC A.

## Nicht getan

- Keine Korrektur an A, keine Migration, kein Re-Deploy, kein zweiter Lauf.
- Kein G3.2.2.

## Vorschlag für die Abnahme (nicht umgesetzt)

Kandidat wäre, die A-From-State-Matrix auf dieselbe belegte, geschlossene Menge wie H zu ziehen und analog zu Gate 1 per Matrix-Smoke zu beweisen (erlaubt vs. verboten, Output-Invarianz, Audit-Vertrag). Das braucht eine eigene Freigabe.

---

# A-Compatibility-Patch (Nachtrag, 2026-08-15)

Freigegebener Scope: ausschließlich `composer_finalize_plate_scene` (RPC A). Kein G3.2.2, keine
Änderung an H, D, Ledger, Webhook-Code oder Frontend. Kein Deploy in diesem Schritt.

## Geschlossene Compatibility-Matrix (temporär, solange die Legacy→State-Bridge aktiv ist)

| From-State | Outputs | State/Substate | Audit |
| --- | --- | --- | --- |
| `plate_rendering` | materialisiert | echte Transition → `plate_ready` über `composer_scene_transition_core` | `from = plate_rendering`, `to = plate_ready`, `applied = true` |
| `plate_ready` | materialisiert | unverändert | `from = to = plate_ready`, `applied = true`, `reason = compatibility_finalize` |
| `audio_prep` | materialisiert | unverändert | `from = to = audio_prep`, `applied = true`, `reason = compatibility_finalize` |
| `audio_ready` | materialisiert | unverändert | `from = to = audio_ready`, `applied = true`, `reason = compatibility_finalize` |
| `lipsync_dispatched`, `lipsync_running`, `lipsync_muxing`, `complete`, `failed`, `canceled`, alle übrigen | keine | keine | `applied = false`, `reason = from_state_rejected` |

Alle vorgelagerten Guards sind unverändert (`write_id`, `stage = base_video`, `external_job_id`,
`run_id = active_run_id`, `plate_generation`, `duplicate_callback`, `attempt_superseded`,
`base_url_required`). Die From-State-Prüfung sitzt in derselben Guard-Kette und erzeugt bei
Ablehnung eine Reject-Audit-Zeile ohne jede Scene-Mutation.

## Zwei Härtungen, die der Smoke erzwungen hat

1. **Keine Lip-Sync-Spiegel im Compatibility-Pfad.** `cinematic_sync` setzt `lip_sync_status`/
   `twoshot_stage` nur noch beim echten `plate_rendering → plate_ready`-Übergang. Im
   Compatibility-Pfad würde `twoshot_stage = 'master_clip'` die Bridge dazu bringen, den State
   selbst zu verschieben.
2. **Aktiver State-Schutz.** Nach dem Output-Write prüft A im Compatibility-Pfad, ob die Bridge
   `pipeline_state` re-derived hat (sie tut das, sobald Legacy-Spalten ohne State-Write geändert
   werden), und stellt den Ausgangs-State inklusive `pipeline_state_at` sofort wieder her. Damit ist
   State-Erhalt garantiert — auch bei inkonsistenten Legacy-Spiegeln.

## DB-Smoke (Fixture-Projekt, danach vollständig gelöscht) — 19/19 PASS

Zwei Fixture-Varianten je erlaubtem State: `mirrors_consistent` (Legacy-Spiegel passend zum State)
und `mirrors_stale` (Spiegel absichtlich widersprüchlich). Verglichen wurde jeweils **nach dem
vollständigen RPC-Aufruf**.

| Fall | Ergebnis |
| --- | --- |
| `plate_rendering` (beide Varianten) | `applied`, Audit `plate_rendering → plate_ready`; Bridge hebt danach wie gehabt auf `audio_ready` (vorbestehendes, dokumentiertes Verhalten) |
| `plate_ready` (beide Varianten) | `compatibility_finalize`, State/Substate exakt identisch |
| `audio_prep` (beide Varianten) | `compatibility_finalize`, State/Substate exakt identisch |
| `audio_ready` (beide Varianten) | `compatibility_finalize`, State/Substate exakt identisch |
| Outputs in allen erlaubten Fällen | `base_video_url` = `clip_url` = Callback-URL, `clip_status = ready`, `clip_error = NULL`, `processed_video_url` unberührt |
| Ledger in allen erlaubten Fällen | Job `succeeded` |
| Duplicate-Callback (8×, je nach Apply) | `duplicate_callback`, Scene-Row **und** Job-Row bis auf `updated_at` byte-identisch, kein zweiter Write |
| `lipsync_dispatched`, `lipsync_running`, `complete` | `from_state_rejected`, vollständiger Scene-Row-Snapshot und Job-Row unverändert, Reject-Audit mit `applied = false` |

## Statische Verifikation

- `npx vitest run src/lib/composer src/lib/video-composer --testTimeout=60000` → **48 Dateien / 540 Tests grün** (eingefrorener Baseline-Command, Zahl unverändert).
- `npx tsgo --noEmit` → grün.
- `deno check --node-modules-dir=auto compose-clip-webhook/index.ts` → **1 vorbestehender Fehler**,
  nicht in dieser Änderung: `TS2322` in `supabase/functions/_shared/ambient-audio.ts:83`
  (`Uint8Array<ArrayBufferLike>` vs. `BlobPart`). Kein TypeScript wurde in diesem Schritt geändert;
  der Befund ist damit unverändert gegenüber dem Stand vor dem Patch und wird als offene Schuld geführt.

## Status

**PATCHED / AWAITING REDEPLOY-GO.** Migration ist eingespielt (DB-seitig aktiv), die
Edge-Function wurde **nicht** neu deployt und ist auch nicht betroffen — A wird über RPC gerufen.
Kein G3.2.2.

## Temporär, nicht dauerhaft

Die Matrix existiert nur, weil die Legacy→State-Bridge Szenen vor dem Plate-Callback nach
`audio_prep`/`audio_ready` vorziehen kann. Nach G6 (Abbau der Legacy-Spiegel) ist sie erneut auf
Reduzierbarkeit zu prüfen; Ziel bleibt `plate_rendering` als einziger From-State.
