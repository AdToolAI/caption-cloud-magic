# v433 — Motion Studio Final Acceptance (FA)

Frozen contracts stay frozen (G3.2.2, G3.2.2-F1, RS3). Findings are fixed on the
level where they occur. A passed FA block is not re-run.

---

## FA-1 — C1 Browser-Smoke (Lip-Sync Intent UI/DB divergence)

**Environment**
- Project: `035273d7-ae9b-44e0-89e7-f9e28703530d` ("v431-g322-resmoke")
- Scene under test: `22cc0e10-cdff-4de8-bb8f-64b4764076e9` (S03), DB truth
  `lip_sync_with_voiceover = false`, `dialog_mode = true`
- Account: `bestofproducts4u@gmail.com` (`8948d3d9-…`), read-only, no render started
- Storage keys: `video-composer-draft:<uid>`, `composer:intent-markers:<uid>`
- Scripts: `/tmp/browser/fa1/fa1.py` (A), `fa1b.py` (B), `fa1c.py` (C)

### Case A — legacy draft (pre-C1, no schema version) with stale ON
Seeded draft: scene with `lipSyncWithVoiceover: true`, `dialogMode: true`,
`engineOverride: 'cinematic-sync'`, no `scenePersistenceState`.

Result after hydration:
- draft migrated → `draftSchemaVersion: 2`
- scene provenance → `db_hydrated`
- `lipSyncWithVoiceover` → **false** (DB wins over the stale draft)
- marker store → empty (no phantom markers created)

**PASS** — legacy stale ON no longer survives; the silent render block cannot recur.

### Case B — orphaned dirty marker (browser death, no in-flight write)
Seeded marker `{ field: lipSyncWithVoiceover, desiredValue: true, setAt: 0 }`
plus a v2 draft with `db_hydrated` / value `true`.

Result after hydration:
- reconcile verdict `lost` → marker cleared (`composer:intent-markers` = `[]`)
- scene value → **false** (DB wins)

**PASS**

### Case C — tri-state before hydration (hydration request delayed 25 s)
Pre-hydration DOM of the scene's master control:
`aria-busy=true`, `disabled=true`, sub-label "Status wird geladen …",
neutral dashed styling — the intent is neither claimed ON nor OFF.
Post-hydration: control enabled and rendering the DB truth.

**Finding (P1, fixed in this block):** the SceneCard master toggle
"Dialog & Lip-Sync" (a User-Writer for `dialogMode`, `lipSyncWithVoiceover`,
`engineOverride`) was not tri-state gated — pre-hydration it rendered and
accepted clicks on the unresolved local value.

**Fix (presentation level only, `src/components/video-composer/SceneCard.tsx`):**
- `intentUnresolved = isSceneIntentUnresolved(scene)` now gates the toggle
- unresolved renders neutral (dashed ring, mid knob, "Status wird geladen …")
- `disabled` + `aria-busy` + click guard while unresolved
- no logic, DB, or pipeline change; frozen contracts untouched

**Verification**
- `tsgo --noEmit`: clean
- `bunx vitest run src/lib/video-composer/__tests__/lipSyncIntentDraft.test.ts`: 20/20 pass
- Case C re-run after the fix: pre-hydration disabled + busy, post-hydration DB truth

**FA-1 — PASS.** No paid render was started.

---

## FA-2 — Standard-Render ohne Lip-Sync (Pre-Start-Snapshot)

**Environment**
- Project: `035273d7-ae9b-44e0-89e7-f9e28703530d`
- Fresh scene S05: `8155c6d8-cb91-4919-bbb2-444db037f466` (order_index 4),
  angelegt über den produktiven UI-Pfad („Szene hinzufügen" → `addSceneToProject`),
  kein SQL-Insert.
- Scripts: `/tmp/browser/fa2/*.py`

### Finding FA-2/P1 (Anlagepfad, vor dem Render gefunden und gefixt)
„Szene hinzufügen" schlug in Produktion **still** fehl: der Insert schrieb
`character_shots: null` und `dialog_voices: null`, beide Spalten sind
`NOT NULL` (Defaults `[]` / `{}`). PostgREST antwortete 400 / `23502`, der
Dashboard-Pfad loggte nur `console.warn` und rollte den optimistischen Insert
zurück — die Szene verschwand wortlos.

Fix (Writer-Ebene, `VideoComposerDashboard.addSceneToProject`): beide Felder
spiegeln jetzt die Spalten-Defaults. Keine Pipeline-, Gate- oder
Vertragsänderung. Verifiziert: erneuter UI-Klick → `POST 201`, Szene
persistiert (`8155c6d8-…`).

### Pre-Start-Snapshot (read-only, vor dem kostenpflichtigen Start)
| Kriterium | Wert |
|---|---|
| `lip_sync_with_voiceover` | `false` |
| `dialog_mode` | `false` |
| `engine_override` | `auto` (nicht in `OPT_IN_ENGINES`) |
| `isLipSyncIntentionalRow()` | **false** (SSoT) |
| `active_run_id` / `active_run_started_at` | `NULL` / `NULL` |
| Ledger `composer_pipeline_jobs` (scene) | **0 Zeilen** |
| Pass-/Job-Pointer | `plate_ready_generation`, `lip_sync_status`, `twoshot_stage`, `lip_sync_applied_at`, `lip_sync_source_clip_url`, `replicate_prediction_id` alle `NULL` |
| RS3-Marker | `audio_plan` = `NULL` (kein `twoshot.rs3_reset`, kein `rs3_reset_id`) |
| Output-Felder | `clip_url`, `base_video_url`, `processed_video_url` alle `NULL` |
| Provider/Engine | `ai-happyhorse`, `clip_quality=standard`, 8 s, `with_audio=false` → normaler Standard-Render |
| Prompt | `scene_action_user` (DE) + `ai_prompt`/`scene_action_en` (EN) gesetzt |
| UI nach Reload | Intent tri-state **resolved**, „Dialog & Lip-Sync" = OFF = DB-Wahrheit |
| `retry_count` / `clip_error` | `0` / `NULL` |

**Status: STOP — Warten auf Renderfreigabe.** Es wurde kein kostenpflichtiger
Render gestartet.

---

## FA-3 — Lip-Sync-Pfad (Single Speaker) · Setup + Pre-Start-Snapshot

**Szene S06 (frisch, ledger-frei):** `d9706a6e-da5e-44f9-b113-f3793b5a9ae2`
(Projekt `035273d7-ae9b-44e0-89e7-f9e28703530d`, `order_index = 5`,
angelegt über den normalen UI-Pfad „Szene hinzufügen").

### Konfiguration (ausschließlich über die UI)
| Feld | Wert |
|---|---|
| Prompt | DE `scene_action_user` + EN `ai_prompt` (Close-up Sprecherin, Studio) |
| `clip_source` | `ai-happyhorse` (v425-zertifiziert) |
| `duration_seconds` | `8.0` (innerhalb HappyHorse 3–15 s) |
| Master-Toggle „Dialog & Lip-Sync" | **AN** → `dialog_mode = true`, `lip_sync_with_voiceover = true`, `engine_override = cinematic-sync` |
| Cast | genau 1 Mitglied: Sarah Dusatko (`5c81f9bf-…`), `shotType = full` |
| `dialog_script` | `Sarah Dusatko: Kurzer Abnahmetest fuer FA drei.` (1 Zeile) |
| `dialog_voices` | `5c81f9bf-… → { engine: elevenlabs, voiceId: EXAVITQu4vr4xnSDxMaL, voiceName: Julia }` |
| `character_voice_id` | `EXAVITQu4vr4xnSDxMaL` (persistiert) |
| Bildquelle / Übergang | „Wie bisher (unverändert)" / „Automatisch" (kein Continuity-Input) |

### Pre-Start-Snapshot (read-only, nach Reload)
| Kriterium | Wert |
|---|---|
| `isLipSyncIntentionalRow()` | **true** (SSoT) |
| `active_run_id` / `active_run_started_at` | `NULL` / `NULL` |
| Ledger `composer_pipeline_jobs` (scene) | **0 Zeilen** — keine `sync_segment`-/`audio_mux`-Attempts |
| Pass-/Job-Pointer | `plate_ready_generation`, `lip_sync_status`, `lip_sync_applied_at`, `lip_sync_source_clip_url`, `twoshot_stage`, `dialog_locked_at`, `replicate_prediction_id` alle `NULL`; `plate_generation = 1` (Default, kein Ready-Stempel) |
| RS3-Marker | `audio_plan = NULL` → kein `twoshot.rs3_reset`, kein `rs3_reset_id` |
| Output-Historie | `clip_url`, `base_video_url`, `processed_video_url`, `preview_clip_url` alle `NULL` |
| `retry_count` / `clip_error` | `0` / `NULL` |
| UI nach Reload | Toggle tri-state **resolved**, `aria-checked = true`, nicht disabled, keine Dirty-/In-Flight-Marker im localStorage → UI == DB |

### Effektiver Dialog (v430-Korrektur berücksichtigt)
- `dialog_turns = []` **vor** dem Lauf — laut v430 zulässig; kanonische Turns
  werden erst im Lauf (`compose-twoshot-audio`) geprägt.
- `parseScriptLines(dialog_script)` → **genau 1 effektive Zeile**,
  Sprecher „Sarah Dusatko" (einziger Cast → `speaker_idx = 0`), Voice persistiert.
- `resolveEffectiveDialog(scene)` liefert in diesem Vorzustand
  `{ turns: [], source: 'script', reason: 'no_turns' }` — die Funktion projiziert
  Skriptzeilen **nicht** auf Turns, solange keine kanonischen Turns existieren.
  Der wirksame Ein-Turn-Nachweis vor Run-Start ist damit der Skript-Parse; die
  Prägung auf genau einen kanonischen Turn erfolgt im Lauf.

### Routing-Nachweis (statisch, frozen Capability Matrix v425)
- Provider `ai-happyhorse` @ 8 s ist zertifizierter Lip-Sync-Master; kein stiller Provider-Fallback.
- `compose-video-clips`: `engineOverride ∈ {cinematic-sync, sync-segments}` →
  `twoshot_stage = 'audio'` → Dispatch an **`compose-twoshot-audio`**
  (mit `run_id` + `plate_generation`) → Plate-Render → **`compose-dialog-segments`**
  → **`sync_segment`** → **`audio_mux`** → **Stitch** (`remotion-webhook`,
  `composer_finalize_lipsync_scene`, Write-ID `stitch:done`).
- Ausgeschlossen: Talking-Head-Route (im Composer entfernt; `heygen` wird vor dem
  Branch auf Cinematic-Sync normalisiert), Direct-Finalize/B-Roll-Pfad
  (`isLipSyncIntentionalPayload = true` → keine Continuity-Inputs, kein Plate-Only-Abschluss),
  Provider-Bypässe (kein Preview-Gate, `Vorschau statt Full-Render` nicht aktiviert).

**FA-3 SETUP READY — STOP.** Kein kostenpflichtiger Render gestartet, kein
Confirm-Dialog bestätigt.

---

## FA-3 — Realer Lauf auf S06 (`d9706a6e-…`) · Ergebnis: **P1 — STOP**

**T_run_start (Confirm-Klick)** = `2026-08-16T22:16:37Z` („Rendern für 336 Cr")
**run_id** = `cce6ee5b-a738-47ed-b668-82e0af6fd2b1`
**Generation** = `plate_generation = 2` (Run-Stempel), `plate_ready_generation = 2`

### Kettennachweis (read-only)
| Schritt | Beleg | Status |
|---|---|---|
| `compose-twoshot-audio` | `audio_plan.twoshot` mit 1 Segment, `speaker: Sarah Dusatko`, `voice EXAVITQu4vr4xnSDxMaL`, 0–2.554 s; `dialog_turns` jetzt **genau 1 kanonischer Turn** (`turnId 683e9a88…`, `order 0`, characterId `5c81f9bf…`) | ✅ |
| Plate | Ledger `base_video` **Attempt 1**, provider `ai-happyhorse`, `succeeded` 22:19:30Z, `base_video_url` gesetzt | ✅ |
| sync_segment | Ledger **Attempt 1**, provider `sync.so`, ext `fd1227f3-…`, `succeeded` 22:21:46Z; genau 1 Pass | ✅ |
| bound Callback + authoritative Apply | Transition `ssw:success`, `caller_class = sync_segment_apply`, `verdict = dispatch_mux`, `applied = true`, `pipeline_job_id 82812728…` | ✅ |
| audio_mux | Ledger **Attempt 1** (`25f276c3…`), ext/`render_id` `ed8636f4-…`, `succeeded` 22:22:08Z; Narrow Patch belegt: `mux_dispatch_requested_at` **und** `dispatched_at` **und** `render_id` gleichzeitig in `dialog_shots.audio_mux` | ✅ |
| Stitch-Finalisierung | Transition `stitch:done`, `caller_class = stitch_finalize`, `source_signature = g322_stitch_finalize`, `reason = finalized`, `applied = true` → `lipsync_running → complete` | ✅ |
| Doppel-Dispatch / Legacy-Completion-Owner | Ledger exakt 3 Zeilen, je Attempt 1, kein Retry (`retry_count = 0`); Completion-Owner ist der RPC, **kein** Legacy-Wrapper | ✅ |

Einziger `legacy`-Eintrag im Transition-Log ist der **Start**-Write
`legacy_wrapper_7` (`idle → plate_queued`, 22:16:39Z) — Dispatch-seitig, nicht
Completion; entspricht dem bekannten, noch nicht migrierten Start-Writer.

### FA-3 P1 — Abweichung: `processed_video_url` bleibt NULL
- Ist-Zustand: `clip_url` = Stitch-Mux-Output, `base_video_url` = Plate,
  `lip_sync_status = 'done'`, aber **`processed_video_url IS NULL`**.
- Ursache (statisch belegt): `composer_finalize_lipsync_scene` setzt in seinem
  UPDATE nur `clip_url`, `lip_sync_source_clip_url`, `lip_sync_status`,
  `twoshot_stage`, `dialog_shots`. Es ruft **nicht**
  `materializeCompatibilityOutput('processed', …)` und schreibt die
  Output-Spalte `processed_video_url` nicht.
- Wirkung:
  - `resolveSceneOutput()` liefert zwar `source = 'processed'`, aber nur über
    den **Legacy-Kompatibilitätszweig** (`lip_sync_status ∈ {done, applied}` →
    `clip_url` als processed). Der Spalten-Vertrag aus
    `materialize-scene-output.ts` (`clip_url === processed_video_url ?? base_video_url`)
    wird nur zufällig erfüllt.
  - `isSceneOutputFinal()` (continuity-state) liefert für diese Szene
    **false**, weil bei Lip-Sync-Intent ausdrücklich `processed_video_url`
    verlangt wird → die Kontinuitätskette hält diesen fertigen Output für
    nicht-final.
- Bewertung: **P1** gegenüber dem FA-3-Abnahmekriterium „processed_video_url
  vorhanden / Compatibility Output korrekt".

**FA-3 = P1 — STOP.** Kein zweiter Versuch, kein Retry/Reset/Cleanup, keine
Code-Änderung. Szene, Ledger und Run-Pointer bleiben unangetastet.

---

## FA-3/P1 — Fix: Stitch Finalizer Output Materialization (implementiert, NICHT deployed)

**Scope**: reine Contract-Conformance auf Writer-Ebene. `resolveSceneOutput()`
und `isSceneOutputFinal()` bleiben unverändert — der Reader hat den Fehler
korrekt sichtbar gemacht.

### Änderung
Neue Migration `supabase/migrations/20260816223000_fa3_p1_stitch_output_materialization.sql`
(`CREATE OR REPLACE FUNCTION public.composer_finalize_lipsync_scene(uuid, text, uuid, text, text)`).

Statischer Funktions-Diff gegen die installierte F1.IMP-Definition
(`20260816185114_…`) — exakt zwei Hunks:
1. Header-Kommentar (nicht ausführbar).
2. Erfolgs-UPDATE auf `composer_scenes`: **eine** zusätzliche Zeile
   `processed_video_url = _final_url,`.

Unverändert und ausdrücklich in der neuen Definition enthalten: Signatur,
`SECURITY DEFINER`, `SET search_path TO 'pg_catalog', 'public'`,
`REVOKE ... FROM PUBLIC/anon/authenticated` + `GRANT EXECUTE ... TO service_role`,
Guard-/Verdict-Matrix, Lock-Reihenfolge (Job → Scene), `_write_id='stitch:done'`-
Allowlist, RS3-Epoch-Fence, Ledger-Terminalisierung, `audio_mux`-Narrow-Merge,
Transition-Log. `base_video_url` bleibt unter Plate-Ownership.
`already_completed` bleibt read-only/idempotent; historische Zeilen mit
`complete` + `processed_video_url IS NULL` werden **nicht** repariert.

### Semantik nach dem Fix (ein Commit)
`stitch:done` → Ledger `succeeded` → Scene `complete` →
`processed_video_url = _final_url` → `clip_url = _final_url` →
`resolveSceneOutput().source = 'processed'` → `isSceneOutputFinal() = true`.

### Pre-Deploy-Evidence
- **Vitest (grün)**: neue Suite
  `src/lib/composer/output/__tests__/fa3P1StitchOutputMaterialization.test.ts`
  belegt: intentionaler Lip-Sync + `complete` + `processed_video_url` ⇒
  `source='processed'` und `isSceneOutputFinal()=true`; derselbe Zustand ohne
  `processed_video_url` bleibt `false`; Non-Lip-Sync-/Plate-Output unverändert.
- **Composer-Suiten**: `bunx vitest run src/lib/composer` → 40 Dateien / 455
  Tests grün. Gesamtlauf: 43 Fehler = unveränderte, dokumentierte Baseline
  (UI-/Komponententests ohne Bezug zum Finalizer).
- **Writer-Inventar korrigiert** (`materializeSceneOutput.test.ts`):
  `remotion-webhook` ist seit F1.IMP ein atomarer DB-Writer
  (`composer_finalize_lipsync_scene`) und steht nicht mehr in
  `FINALIZATION_POINTS`; die Feldprüfung nutzt jetzt eine Wortgrenze, damit
  `preclip_url:` nicht fälschlich als `clip_url`-Write zählt.
- **SQL-Contracttests vorbereitet** (`tests/v431-g3-2-2-f1-contract-tests.sql`):
  Happy Path prüft zusätzlich `processed_video_url = final_url` und
  `clip_url = final_url`; Duplicate-Zweig prüft Unverändertheit beider Spalten.
  Ausführung **erst nach** dem produktiven DB-Deploy (nur Produktiv-DB
  vorhanden).
- **Kein Edge-Redeploy nötig** — `remotion-webhook` ruft den RPC bereits auf.

**Status: FA-3/P1 IMPLEMENTED — STOP vor Production-DB-Deploy.**
Deploy-Reihenfolge danach: Migration anwenden → Security/Signature/Body-Smoke →
SQL-Contracttests inkl. `processed_video_url` → Residuen-Check → frische
FA-3-Szene (nicht S06) → genau ein Render. FA-1/FA-2 bleiben PASS.

---

## FA-3/P1 — Production DB Deploy + Verification

### 1. Deploy

- Angewendet: `supabase/migrations/20260816223000_fa3_p1_stitch_output_materialization.sql`
  (`CREATE OR REPLACE FUNCTION public.composer_finalize_lipsync_scene(uuid, text, uuid, text, text)`),
  eine Migration, kein Edge-Redeploy.
- **T_FA3_P1_db = 2026-08-16 22:56:18 UTC** (`now() at time zone 'utc'` direkt nach Erfolg).
- Security-Linter: 286 Findings = unveränderte Projekt-Baseline (RLS-Info /
  Function-Search-Path-Warnungen aus Altbeständen), keine neuen Findings durch
  diese Migration.

### 2. Body-/Security-Smoke (read-only, `pg_proc` / `has_function_privilege`)

```text
sig_count            = 1
identity_args        = _pipeline_job_id uuid, _external_job_id text, _scene_id uuid, _final_url text, _write_id text
prosecdef            = true
proconfig            = search_path=pg_catalog, public
owner                = postgres
prosrc md5 (vorher)  = 746f842e0ee0b49c11f8189cd19d31c2
prosrc md5 (nachher) = 9d6ba907e6338014d3e903d0c6aa4b48
```

EXECUTE-Privilegien, per tatsächlicher Privilege-Prüfung
(`has_function_privilege(role, oid, 'EXECUTE')`), nicht per ACL-Textlesung:

```text
service_role   EXECUTE = true
anon           EXECUTE = false
authenticated  EXECUTE = false
authenticator  EXECUTE = false
PUBLIC         EXECUTE = false
```

Getrennt ausgewiesen, kein Verstoß gegen die Grant-Grenze:

```text
postgres        EXECUTE = true   (Owner)
supabase_admin  EXECUTE = true   (Plattform-Superuser, Bypass)
ACL             = postgres=X/postgres | service_role=X/postgres | sandbox_exec_<ref>=X/postgres
                  (der sandbox_exec_<ref>-Eintrag ist Bestand aus dem Vorzustand,
                   wurde durch CREATE OR REPLACE übernommen und nicht erweitert)
```

**Struktureller Body-Nachweis** (Extraktion des Erfolgs-UPDATE aus `prosrc`,
nicht bloßes Token-Vorkommen). Top-Level-SET-Ziele des
`UPDATE public.composer_scenes ... WHERE id = _scene.id`:

```text
pipeline_state, pipeline_state_at, clip_status,
processed_video_url, clip_url,
lip_sync_status, lip_sync_applied_at, lip_sync_source_clip_url,
twoshot_stage, clip_error, dialog_shots, updated_at
```

```sql
      processed_video_url = _final_url,
      clip_url            = _final_url,
```

`base_video_url` kommt im gesamten installierten Body **kein einziges Mal** vor
(0 Treffer) — die Plate-Ownership bleibt unangetastet. Es existieren genau zwei
UPDATE-Statements: `composer_pipeline_jobs` (Terminalisierung) und
`composer_scenes` (Finalisierung), Lock-Reihenfolge Job → Scene unverändert.

Diff installierter Body gegen den F1.IMP-Vorzustand (`unified diff`):

```text
--- prev_F1
+++ installed
@@
       pipeline_state_at = now(),
       clip_status = 'ready',
+      processed_video_url = _final_url,
       clip_url = _final_url,
       lip_sync_status = 'done',
```

Genau eine hinzugefügte Zeile, keine weitere Abweichung. Guard-/Verdict-/RS3-/
Ledger-Semantik damit beweisbar unverändert (`invalid_write_id`, `no_ledger_job`,
`wrong_job`, `wrong_stage`, `stale_run`, `stale_generation`, `already_completed`,
`canceled`, `dispatch_uncertain`, `pre_reset_attempt`, `rs3_reset_id`,
`stitch:done`-Allowlist, `g322_stitch_finalize`).

**Ergebnis Schritt 2: PASS.**

### 3. SQL-Contracttests — BLOCKIERT (STOP, kein stilles Nachbessern)

`tests/v431-g3-2-2-f1-contract-tests.sql` konnte gegen den installierten Body
**nicht** ausgeführt werden:

```text
current_user = sandbox_exec
has_function_privilege('sandbox_exec', composer_finalize_lipsync_scene, 'EXECUTE') = false
psql: ERROR: permission denied for function composer_finalize_lipsync_scene
```

Ursache ist die eingefrorene Grant-Grenze selbst: die Funktion ist
`service_role`-only, und die Sandbox-Rolle darf per Plattform-Design keine
Datenbankfunktionen ausführen. Die im Testfile enthaltene Zeile
`GRANT EXECUTE ... TO sandbox_exec` schlägt ebenfalls fehl (keine Ownership) —
und ein Grant-Workaround ist ausdrücklich verboten. Ein Service-Role-Key ist auf
Lovable Cloud nicht verfügbar.

Verbleibender privilegierter Ausführungsweg: das Migrationstool (läuft als
`postgres`). Die Tests würden dort als self-rolling-back DO-Block laufen
(Sub-Transaktion + kontrolliertes Zurückrollen, kein Schema-Change, kein
Commit von Testdaten). Das ist eine Prozessabweichung gegenüber „keine weitere
Migration" und wird deshalb **nicht** eigenmächtig ausgeführt.

**Ergebnis Schritt 3: BLOCKED — Freigabe erforderlich.**

### 4. Residuen-Check (nach Deploy, vor Tests)

```text
Test-Scenes (order_index = 999999)                = 0
Test-Ledger-Rows (idempotency_key like 'f1-test-%') = 0
Test-Transition-Rows (render-123/456/789/rs3-old)  = 0
Funktionen im Schema public: vorher 344 / nachher 344 (keine Testfunktionen)
ACL composer_finalize_lipsync_scene: unverändert gegenüber Vorzustand
```

**Ergebnis Schritt 4: PASS** (Stand vor Ausführung der Contracttests).

### Status

**FA-3/P1 DB DEPLOY VERIFIED (Schritte 1, 2, 4) — SQL-Contracttests BLOCKED.**
Kein FA-3-Render, keine neue Szene. FA-1 und FA-2 bleiben PASS.

---

## FA-3/P1 — Contracttests via verification-only migration (2026-08-16 23:06 UTC)

**Verification-only migration; no schema/data mutation persisted.**

Migration: `supabase/migrations/20260816230559_1ef0a17a-f5eb-44d9-b8b3-9814b774d6dc.sql`
(T_FA3_P1_verif = 2026-08-16 23:06:09 UTC)

### Vertrag (eingehalten)

- kein `CREATE/ALTER/DROP FUNCTION`, kein `GRANT`/`REVOKE`
- keine Änderung am Finalizer-Body
- ausschließlich Fixtures + Aufruf des bereits installierten RPC + Assertions
- drei getrennte innere Subtransaktionen, jede endet mit Sentinel
  `RAISE EXCEPTION USING ERRCODE = 'FA3P1'`; gefangen wird ausschließlich
  `WHEN SQLSTATE 'FA3P1'` — kein `WHEN OTHERS`, kein Catch von `P0001`
- Lauf als Migration-Owner (`postgres`); die ACL wurde separat via
  `has_function_privilege` nachgewiesen und hier nicht erneut geprüft
- einzige dauerhafte Spur: der Migrationseintrag selbst

### Contractfälle — alle GRÜN (Migration lief fehlerfrei durch)

1. **Happy Path** — `verdict='finalized'`, `pipeline_state='complete'`,
   `processed_video_url = clip_url = _final_url`,
   `base_video_url` byte-identisch zum Fixture-Sentinel
   (`https://sentinel.invalid/fa3p1-base-DO-NOT-TOUCH.mp4`),
   Ledger-Job terminal (`status='succeeded'`, `completed_at` gesetzt,
   Job-Identität scene/run/stage/plate_generation unverändert),
   `write_id='stitch:done'` genau 1× applied im
   `composer_scene_transition_log` (dort, wo der Contract ihn persistiert).
2. **Duplicate/Idempotenz** — zweiter identischer Aufruf →
   `verdict='already_completed'`, Output unverändert, `completed_at`
   unverändert (keine zweite Terminalisierung), weiterhin genau 1 applied
   `stitch:done`-Transition.
3. **RS3 Pre-Reset-Fence** — veralteter Callback (`rs3_reset_id='reset-epoch-0'`
   gegen Scene-Epoch `reset-epoch-1`) → `verdict='pre_reset_attempt'`,
   `processed_video_url` und `clip_url` bleiben NULL, `base_video_url`
   unverändert, Szene nicht `complete`.

### Post-Migration Read-only Verifikation

```text
Test-Scenes (order_index 999901/999902/999903)      = 0
Test-Jobs (idempotency_key like 'fa3p1-verif-%')    = 0
Verwaiste Test-Transition-Rows                      = 0
Funktionen im Schema public                         = 344 (unverändert)
ACL: service_role=true; anon/authenticated/authenticator/PUBLIC=false (unverändert)
Finalizer-Body md5                                  = 47aa2f2957537ccfe00c913693411a66 (identisch vor/nach)
Persistente Spur                                    = ausschließlich der Migrationseintrag
```

### Status

**FA-3/P1 DB DEPLOY VERIFIED.** Kein weiterer Deploy-Schritt.
FA-1 und FA-2 bleiben PASS. Nächster Schritt: FA-3 RETEST SETUP mit frischer Szene.

---

## FA-3 RETEST — Kostenpflichtiger Render (P1-Retest)

### Lauf-Identität

```text
Szene            = 5b0dca87-016f-4581-9af8-ba9276fc803e (frisch, order_index 6 / S07)
Projekt          = 035273d7-ae9b-44e0-89e7-f9e28703530d
run_id           = 7f236697-502f-4703-8ddf-1d9ebf2544b2
T_run_start      = 2026-08-16 23:26:40.545532+00 (active_run_started_at)
plate_generation = 2
Kostenbestätigung= 469 Cr / €4.69 (Video 336 + VO 5 + Lip-Sync 128)
Start-Pfad       = UI-Renderdialog → composer-start-scene-generation
Nach Bestätigung = read-only Beobachtung, kein Retry/Reset/Cleanup
```

### Abnahmekriterien

| # | Kriterium | Belegt | Ergebnis |
|---|-----------|--------|----------|
| 1 | genau 1 kanonischer Turn, speaker_idx 0, korrekte Voice | `dialog_turns` = 1 Eintrag (`order=0`, char `5c81f9bf…`), `audio_plan.twoshot.segments[0].voice = EXAVITQu4vr4xnSDxMaL` (ElevenLabs, Sarah Dusatko), `slotIndex=0` | PASS |
| 2 | Plate/Anchor erfolgreich, `reference_image_url` erzeugt und als Geometrieanker genutzt | Anchor `…/scene-anchors/5b0dca87-…-188fb8bf743d.png` (23:27:02), `anchor_face_audit.ok=true` (1/1 Face), `faceMap.source='anchor'`, `faceMap.anchorUrl == reference_image_url` — erzeugt **vor** Sync-Dispatch (23:30:23) → v400-konform | PASS |
| 3 | genau 1 `base_video` Attempt 1 | Ledger: `base_video/1/succeeded`, provider `ai-happyhorse`, ext `br1d3jvfexrmw0d01kk89g1vw8` | PASS |
| 4 | genau 1 `sync_segment` Attempt 1 + positiver bound-Callback | Ledger: `sync_segment/1/succeeded`, provider `sync.so`, ext `30196cb9-…`, `callback_delivery_status='succeeded'` | PASS |
| 5 | authoritative Apply → dispatch_mux | Transition `ssw:success` / reason `applied` (23:31:29), unmittelbar gefolgt von audio_mux-Acquire (23:31:29.637) | PASS |
| 6 | genau 1 `audio_mux` Attempt 1 + realer render_id | Ledger: `audio_mux/1/succeeded`, provider `remotion`, render_id `f3372ec5-b706-4dd9-ac69-f55f6500d88b`, dispatcher `sync-so-webhook`, `fan_in_passes=1` | PASS |
| 7 | Narrow Patch bleibt korrekt | `mux_dispatch`-Provenienz erhalten, kein zweiter mux-Job, kein `replaced_by` | PASS |
| 8 | Stitch → `composer_finalize_lipsync_scene(…, 'stitch:done')` | Transition `lipsync_running → complete`, `write_id='stitch:done'`, reason `finalized` (23:31:48) | PASS |
| 9 | audio_mux → succeeded + `completed_at` | `completed_at = 2026-08-16 23:31:48.250847+00` | PASS |
| 10 | Scene → complete | `pipeline_state='complete'`, `lip_sync_status='done'`, `twoshot_stage='done'` | PASS |
| 11 | `processed_video_url = final_url` | `…/dialog-stitch-muxed-5b0dca87-…-1786923091869.mp4` | PASS |
| 12 | `clip_url = final_url` | identisch (`clip_url = processed_video_url` → true) | PASS |
| 13 | `resolveSceneOutput().source = 'processed'` | `{source:'processed', isLipsynced:true, effectiveUrl=final_url}` | PASS |
| 14 | **`isSceneOutputFinal() = true` (P1-Retest)** | `true` | **PASS** |
| 15 | kein Legacy-Completion-Owner, keine Doppel-Dispatches | Ledger exakt 3 Jobs (je Attempt 1), 3 Callback-Observations, kein RS3-Marker, einziger Legacy-Write ist der Start-Wrapper (`legacy_wrapper_7`, idle→plate_queued); Completion ausschließlich über RPC-Writer | PASS |

### Transition-Log

```text
23:26:41  idle            → plate_queued     legacy_wrapper_7
23:29:24  audio_ready     → audio_ready      ccw:plate-complete   (compatibility_finalize)
23:31:29  lipsync_running → lipsync_running  ssw:success          (applied)
23:31:48  lipsync_running → complete         stitch:done          (finalized)
```

`composer_state_guard_violations`: 4 Zeilen, alle `verdict='observed'` / `reason='v400_july_baseline_observe_only'` — reine Telemetrie gemäß v398-Rollback, keine Blockade.

### Endzustand

```text
pipeline_state       = complete
clip_url             = s3://…/dialog-stitch-muxed-5b0dca87-…-1786923091869.mp4
processed_video_url  = identisch mit clip_url
base_video_url       = supabase://ai-videos/composer/…/5b0dca87-….mp4 (unverändert, Plate)
reference_image_url  = composer-frames/…/scene-anchors/5b0dca87-…-188fb8bf743d.png
```

### Status

**FA-3 = PASS.** Der P1-Fix (`processed_video_url = _final_url` im Stitch-Finalizer)
ist im Produktionslauf bestätigt: `isSceneOutputFinal() = true`.
FA-1, FA-2, FA-3 sind damit alle PASS — **Motion Studio Final Acceptance abgeschlossen.**

---

## FA-4 SETUP — 4 deutsche Sprecher, 6 Turns (kein Render)

Stand: Setup + Pre-Start-Snapshot. **Kein kostenpflichtiger Render gestartet.**

### Szene

```text
project_id  = 035273d7-ae9b-44e0-89e7-f9e28703530d
scene_id    = 42bcdda1-3a42-4d2a-b43e-21f1888cd1f2
order_index = 7  (UI: S08, "Szene 8 / 8 · Custom")
scene_type  = custom
provider    = ai-happyhorse (zertifiziert, Multi-Speaker)
modus       = cinematic-sync, intentionaler Lip-Sync (Toggle ON)
duration    = 15s
```

### Cast & Stimmen (bijektiv, 4 Identitäten)

| speaker | Charakter        | brand_characters.id | Voice (ElevenLabs) | Voice-ID             |
|---------|------------------|---------------------|--------------------|----------------------|
| 0       | Sarah Dusatko    | 5c81f9bf…           | Sarah              | EXAVITQu4vr4xnSDxMaL |
| 1       | Samuel Dusatko   | 483f9cdc…           | George             | JBFqnCBsd6RMkjVDRZzb |
| 2       | Matthew Dusatko  | 54d90504…           | Liam               | TX3LPaxmHKxFdv7VOQHJ |
| 3       | Kay Mark         | c65de5c6…           | Brian              | nPczCjzI2devNBz1zQrb |

UI bestätigt: „Cast voll (max. 4)", vier verschiedene Stimmen, keine Doppelbelegung.
`speaker_idx` wird bewusst **nicht** vorab erzwungen — die Prägung erfolgt deterministisch im Lauf.

### Dialog (6 kanonische Turns, DE)

```text
1 Sarah Dusatko:   Kurz die Zahlen von gestern.
2 Samuel Dusatko:  Kampagne läuft über Plan.
3 Matthew Dusatko: Neue Creatives performen besser.
4 Kay Mark:        Dann Budget nachziehen.
5 Sarah Dusatko:   Gut, Kurs halten.
6 Samuel Dusatko:  Übersicht kommt gleich.
```

UI-Anzeige nach der Kürzung (v2): „6 Blöcke · 4 Sprecher · **~9s**" — deutlicher
Abstand zur 15-s-Plate (v1 lag bei ~12s und damit unnötig nah am Budget-Limit).

### Routing-Nachweis (UI)

- „Dialog-Shot Pipeline: Pro Sprecher-Turn ein eigener Basis-Clip + dedizierter
  Lippensynchronisation. **6 Shots** werden am Ende zu einer Szene gestitcht."
- Erwartete Job-Kardinalität im Ledger: **6 × sync_segment → 1 × audio_mux → 1 × stitch**
  (Sprecheranzahl bestimmt Identität/Geometrie, nicht die Job-Anzahl).
- Provider-Hinweis: HappyHorse Multi-Speaker (Beta) mit automatischem Credit-Refund,
  falls die Plate die Face-Detection nicht besteht.

### Kostenvoranschlag

```text
Szene S08: €6.30   (15s × €0.42/s, HappyHorse 1.0, 720p)
```

### Pre-Start-Snapshot (read-only)

```text
pipeline_state        = idle
active_run_id         = NULL
clip_url              = NULL
processed_video_url   = NULL
base_video_url        = NULL
composer_pipeline_jobs (scene) = 0 Zeilen
cast_count = 4 · script_lines = 6
```

### Status

**FA-4 SETUP READY → STOP.** Kein Render freigegeben.

### Harte FA-4-Kriterien für den späteren Render

1. Mapping-Invariante: stabile `speaker_idx` 0..3, bijektiv zu den vier Identitäten.
2. Genau 6 sync_segment-Attempts.
3. Genau 1 audio_mux.
4. Genau 1 Stitch mit atomarer `processed_video_url`-Materialisierung (FA-3/P1).
5. Visuelle Sichtung: korrekter Mund/Stimme je Turn, kein Cross-Talk.

### FA-4 SETUP v2 — Dialog-Kürzung (2026-08-17)

Die sechs Zeilen wurden über das Skript-Studio (Szene S08) gekürzt. Struktur
unverändert: 6 Turns, 4 Sprecher, Sarah und Samuel je zweimal, Plate 15s.

Pre-Run-Verifikation (bewusst **ohne** `resolveEffectiveDialog()` als
Dauernachweis — bei `dialog_turns = []` liefert die Funktion vertragsgemäß
`reason='no_turns'`, wie bei FA-3):

| Kriterium                              | Ergebnis |
|----------------------------------------|----------|
| Skriptzeilen / Sprecher                | 6 Zeilen / 4 Sprecher (UI: „Skript schreiben · 6 Zeilen", „6 Blöcke · 4 Sprecher") |
| UI-TTS-Prognose                        | **~9s** (Ziel 8–10s) |
| Persistierte Voices                    | 4 unterschiedliche, in `dialog_voices` gebunden (Sarah / George / Liam / Brian) |
| Plate-Dauer vs. Sprechzeit             | 15s Plate ≫ ~9s Dialog |
| Cast-Zuordnung                         | bijektiv, „Cast voll (max. 4)" |

Persistierter DB-Stand (`composer_scenes`, Szene `42bcdda1-…`):

```text
dialog_script       = 6 gekürzte Zeilen (identisch zur UI)
dialog_voices       = 4 Einträge, je eigene elevenlabsVoiceId
dialog_turns        = []            (kanonische Prägung erst im Lauf)
duration_seconds    = 15.0
pipeline_state      = idle
active_run_id       = NULL
clip_url / processed_video_url / base_video_url = NULL
composer_pipeline_jobs (scene)                  = 0
```

Kostenvoranschlag S08 (nur abgelesen, keine Acceptance-Erwartung): **€6.30** —
unverändert gegenüber v1, kein Routing- oder Konfigurationswechsel.

Die reale kanonische Turn-Dauer wird erst nach `compose-twoshot-audio` im Lauf
geprüft.

**FA-4 SETUP v2 READY → STOP.** Kein Render gestartet.

---

## FA-4/P0 — 4-Speaker Render: Pre-Dispatch Failure (Root Cause)

**Status:** FA-4 P0 — ROOT CAUSE IDENTIFIED / AWAITING FIX CONTRACT.

**Kein Fix, kein Retry, kein Reset, kein Cleanup, kein neuer Render, keine Migration, kein Deploy.**

### Lauf-Identität

```text
Szene            = 42bcdda1-3a42-4d2a-b43e-21f1888cd1f2 (S08)
Projekt          = 035273d7-ae9b-44e0-89e7-f9e28703530d
run_id           = 56955451-fe9e-4116-8dd2-5734ba8653c9
T_run_start      = 2026-08-17 00:22:56 UTC (active_run_started_at)
plate_generation = 2
Kostenbestätigung= 2.075 Cr / ~€6.30
```

### Failure-Owner

`supabase/functions/compose-dialog-segments/index.ts`, Zweig
`v161PreclipEligible → preclipResult !ok → speakers.length >= 2` (Zeilen 5367–5409):
`logSyncDispatch(PREFLIGHT_BLOCKED)` → `failLipSync(...)` → HTTP 422 + Refund.

### Endzustand (read-only)

```text
pipeline_state        = failed
pipeline_substate     = lipsync_failed
clip_status           = ready (Plate intakt)
clip_url              = gesetzt
processed_video_url   = NULL
clip_error            = v187_preclip_required_no_fullplate_fallback:
                        Preclip für „Sarah Dusatko" wurde nicht rechtzeitig fertig
                        (invoke_502: 502 Bad Gateway). Kein Full-Plate-Fallback...
dialog_shots.passes   = genau 1 Eintrag: idx=0, status=rendering_preflight
refunded_credits      = true
composer_pipeline_jobs= 1 Zeile: base_video/1/succeeded
```

### Zeitleiste

```text
00:23:06.341  idle            → plate_queued      legacy_wrapper_7
00:29:40.870  audio_ready     → audio_ready       ccw:plate-complete (base_video succeeded)
00:30:11.999  v278 anchor_layout_recovered, facemap 4/4
00:30:35.250  pass 0 preflight-claim (rendering_preflight)
00:30:38.171  video_renders 8d4596d3… angelegt
00:30:38.287  video_renders → failed: "invoke 502: 502 Bad Gateway"
00:30:38.994  dialog_shots  → failed, refunded=true
00:30:39.642  composer_scenes → failed / lipsync_failed
00:30:40.050  ccw:handoff_failed rejected (unexpected_from_state, applied=false)
```

Zwischen 00:30:39 und 00:39:30 passierte nichts. Ein Watchdog war nicht involviert;
Stall und Failure sind dasselbe Ereignis.

### Was erreicht wurde, bevor der Fehler eintrat

- 6 kanonische Turns in `dialog_turns` geprägt.
- 4 stabile `speaker_idx` 0..3, bijektiv zu den vier Characters.
- `v278 anchor_layout_recovered` mit Face-Mapping 4/4.
- Plate (`base_video`, HappyHorse) erfolgreich.

### Was nicht erreicht wurde

- Kein `sync_segment`-Ledger-Job wurde jemals erzeugt.
- Kein `audio_mux`, kein Stitch, keine `processed_video_url`.

### Warum kein `sync_segment`-Acquire

Der Ledger-Acquire (`stage:"sync_segment"`, Zeile ~5980) liegt strikt hinter dem
Preclip-Block (Zeile 5308). Der 422-Return bei 5402 verlässt die Funktion vor jeder
Ledger-Interaktion. Das Ledger-Bild ist daher korrekt: genau 1 Job (`base_video`,
succeeded).

### Root Cause

Ein **transienter HTTP 502 des `invoke-remotion-render`-Gateways** beim allerersten
Preclip-Dispatch (Pass 0, Sarah Dusatko). `pass-face-preclip.ts` behandelt diesen
Infrastrukturfehler (`errorClass: "dispatch_failed"`) ohne jeden Wiederholversuch
wie einen inhaltlichen Preclip-Fehler. Ein 3-Sekunden-Gateway-Ausfall hat damit einen
kompletten 4-Sprecher-Lauf nach bereits bezahlter Plate-Arbeit terminalisiert und
refundet.

### Guard-Matrix

- `renderPassFacePreclip` (v69) läuft für alle N (1..4); keine N-Verzweigung.
- `speakers.length >= 2` ist das Fail-closed-Kriterium „mehr als ein Gesicht auf der
  Plate ⇒ kein Full-Plate-Fallback", kein Zweier-Cap.
- Slots 0..3, 6 Turns, 4 stabile `speaker_idx` waren korrekt.
- **Kein 4-Speaker-Limit (Klasse A ausgeschlossen).**
- **Keine versteckte 2-Speaker-Annahme (Klasse B ausgeschlossen).**
- **Kein Watchdog-Beteiligung (Stall = Failure).**

### Klassifikation

**C — allgemeiner Preflight-Resilienz-Bug.** Kein A, kein B, kein D.

### Fix noch nicht freigegeben

Ein Retry bei HTTP 5xx/Netzwerk ist potenziell `dispatch_uncertain`. Vor einer
Implementation muss geklärt werden, wie derselbe logische Preclip-Render idempotent
wiederaufgenommen werden kann, ohne einen Doppelrender zu erzeugen.

Vorläufige Fakten aus der Code-Sichtung:

- `pass-face-preclip.ts` legt die `video_renders`-Zeile **vor** dem Invoke an.
- `invoke-remotion-render` nimmt eine stabile `pendingRenderId` entgegen.
- Es gibt bereits einen `alreadyStarted`-Kurzschluss, wenn
  `content_config.real_remotion_render_id` gesetzt oder der Render abgeschlossen ist.

Offen bleiben:

1. Das Race-Fenster zwischen Lambda-Start und Persistierung von `real_remotion_render_id`.
2. Der heutige Fehlerpfad setzt die `video_renders`-Zeile sofort auf `failed`, was den
   Wiederaufnahme-Zustand zerstört.
3. Die Klassifikation muss von „dispatch_failed" zu „dispatch_uncertain" geändert werden.

`lambda_failed`, inhaltlicher Preclip-Fehler, `invalid_input` und echter Poll-Timeout
bleiben wie heute nicht retryable.

Nebenbefund (reine Presenter-/Diagnoseebene): Die Meldung „wurde nicht rechtzeitig
fertig" bei einem 116-ms-Dispatch-502 ist irreführend und sollte 502/Dispatch-Fehler
klar von Timeout unterscheiden.

### Nächster Schritt

FA-4/P0 Fix Contract: ausschließlich die Frage beantworten, wie ein
`dispatch_uncertain`-Preclip idempotent wiederaufgenommen werden kann. Erst danach Code.

---

## FA-4/P0 — Fix Contract: Exactly-Once Preclip Dispatch Resume (implementiert)

**Vertrag (verbindlich):**

1. **Eine Row, eine ID.** Pro logischem Preclip existiert genau eine
   `video_renders`-Row mit genau einer `pendingRenderId`. Ein Retry erzeugt
   niemals eine zweite Row und niemals eine neue ID.
2. **Atomarer Dispatch-Claim.** `content_config.lambda_invoked_at` ist der
   Start-Fence. Er wird in `invoke-remotion-render` per echtem CAS gesetzt
   (`UPDATE ... WHERE content_config->>'lambda_invoked_at' IS NULL`). Nur der
   CAS-Gewinner ruft AWS auf.
3. **Claim = endgültig.** Ist der Claim gesetzt, startet niemand mehr AWS —
   unabhängig von vergangener Zeit, Prozess-Neustarts oder Parallelaufrufen.
   Antwort: `alreadyStarted: true, unresolved: true` → der Aufrufer pollt nur.
4. **5xx/Netzwerk = `dispatch_uncertain`.** Die Row wird nicht zerstört und
   nicht zurückgesetzt. Der Aufrufer liest dieselbe Row erneut (Recheck).
5. **Reinvoke nur ohne Claim.** Existiert nachweislich kein Claim, darf genau
   ein Reinvoke mit *derselben* `pendingRenderId` erfolgen (3 s Backoff).
6. **Kein Fortschritt bis Budgetende** → v187 fail-closed mit eigener
   Diagnoseklasse `dispatch_uncertain` (nicht `poll_timeout`) und genau einem
   Refund. Kein Full-Plate-Fallback.

**Geänderte Dateien (Narrow Unfreeze):**

- `supabase/functions/_shared/preclip-dispatch-resume.ts` (neu) — reine
  Entscheidungslogik: `classifyDispatchOutcome`, `hasDispatchClaim`,
  `decideAfterUncertainDispatch`, `decideInvokeAction`,
  `terminalClassOnNoProgress`.
- `supabase/functions/invoke-remotion-render/index.ts` — Start-Fence + CAS-Claim.
- `supabase/functions/_shared/pass-face-preclip.ts` — Recheck/Reinvoke-Schleife,
  Fehlerklasse `dispatch_uncertain`.
- `supabase/functions/compose-dialog-segments/index.ts` — Presenter trennt
  Infrastrukturfehler von echtem Timeout (DE/EN/ES), `preclip_error_class` in
  der 422-Antwort.

**Verifikation:** `deno test supabase/functions/_shared/preclip-dispatch-resume.test.ts`
— 8/8 PASS (Happy Path, 502/Netzwerk = uncertain, 4xx = definitiv, Claim
vorhanden → nur pollen, kein Claim → Reinvoke gleicher ID, Race mit genau einem
AWS-Start, completed = No-op, Budgetende behält eigene Klasse).

---

## FA-4/P0 — Deploy Verification (DEPLOY VERIFIED)

**T_FA4_P0_effective = 2026-08-17T09:35:01Z** (erfolgreicher Deploy von
`compose-dialog-segments`; `invoke-remotion-render` unmittelbar davor).

### Deploy-Scope (statisch belegt)

- `grep "import .*pass-face-preclip"` → genau 1 Importer:
  `compose-dialog-segments/index.ts:98`.
- `grep "preclip-dispatch-resume"` → `_shared/pass-face-preclip.ts`,
  `invoke-remotion-render/index.ts`, plus die Testdatei (nicht deploy-relevant).
- `_shared/lipsync-frozen-contract.ts` nennt das Modul nur im Kommentar — keine
  Import-Kante.
- Deploy-Reihenfolge verbindlich: (1) `invoke-remotion-render`,
  (2) `compose-dialog-segments`. Kein Zwischenfenster mit neuem Caller gegen
  alte Invoke-Semantik. Keine DB-Migration.
- Deployment-IDs/Versionen wurden vom Deploy-Werkzeug nicht zurückgegeben; als
  Nachweis dient `T_FA4_P0_effective` plus die Boot-Smoke-Antworten unten.

### Boot-/Validation-Smoke (keine Render-Payload)

| Function | Request | Antwort |
|---|---|---|
| `invoke-remotion-render` | `POST {}` | `400 {"error":"lambdaPayload, pendingRenderId, and userId are required"}` |
| `compose-dialog-segments` | `POST {}` | `400 {"error":"scene_id_required"}` |

Beide Bundles laden inklusive des neuen Shared-Moduls; sauberer
Validierungspfad statt Boot-Fehler.

### Sanity-Checkliste (alle grün)

- [x] CAS-Claim auf `lambda_invoked_at` — `invoke-remotion-render:255/264`
      (`UPDATE ... .is('content_config->>lambda_invoked_at', null)`).
- [x] Gesetzter Claim ⇒ kein weiterer AWS-Start (`already_started_unresolved`,
      Zeilen 97–108).
- [x] 5xx/Netzwerk ⇒ `dispatch_uncertain`, Row bleibt bestehen (kein
      `failed`-Write im Resume-Pfad, `pass-face-preclip.ts:452–560`).
- [x] Resume nutzt dieselbe `pendingRenderId` (`fa4p0_reinvoke_ok
      same_render_id=…`, Zeile 516).
- [x] Kein neuer `video_renders`-Row beim Resume — alle Resume-Zugriffe sind
      `select`/`update` auf `render_id = renderId`.
- [x] `lambda_failed`, `poll_timeout`, `invalid_input`, Config/Credentials
      bleiben non-retryable (`isDefinitiveRejection`, Zeilen 447/474/518).
- [x] v187 bleibt fail-closed — kein Full-Plate-Fallback bei >= 2 Sprechern.
- [x] Refund unverändert idempotent (eine `failScene`-Stelle mit
      `refundCredits: totalCost` pro Abbruch).
- [x] DE/EN/ES-Meldungen für Infrastruktur- vs. Timeout-Fall vorhanden;
      422-Antwort enthält `preclip_error_class`.
- [x] `deno test _shared/preclip-dispatch-resume.test.ts` → 8/8 PASS.

**Status: FA-4/P0 DEPLOY VERIFIED — STOP, kein Render.** FA-1 bis FA-3 bleiben
PASS. Der Retest erfolgt separat mit einer frischen 4-Speaker-/6-Turn-Szene;
die fehlgeschlagene S08 bleibt als Evidence unangetastet.

## FA-4 RETEST SETUP READY (2026-08-17)

Szene S09 `ece6a71c-118e-436a-ac1a-15182cc88ddb` — kein Render gestartet.

| Kriterium | Ist |
| --- | --- |
| dialog_voices | 4 distinct: `u86DavlmJKwP4sPOSkw7` (Samuel, Brand), `EXAVITQu4vr4xnSDxMaL` (Sarah/Julia), `pqHfZKP75CvOlQylNhV4` (Matthew/Stefan), `onwK4e9ZLuTAKqWW03F9` (Kay/Markus) |
| Skript | 6 Zeilen, 4 Characters, Sarah 2×, Samuel 2× |
| UI-TTS-Prognose | „6 Blöcke · 4 Sprecher · ~8s" |
| dialog_mode / lip_sync_with_voiceover | true / true |
| engine_override / clip_source | `cinematic-sync` / `ai-happyhorse` (zertifizierter Multi-Speaker-Pfad) |
| C1 nach Reload | resolved, DB-konsistent (Toggle ON aus DB hydratisiert) |
| active_run_id / pipeline_state | NULL / `idle` |
| Ledger (`composer_pipeline_jobs`) | 0 |
| Outputs (clip/base/base_video/processed/preview) | alle NULL |
| Pass-/Job-Pointer | `plate_pipeline_job_id` NULL, `lip_sync_status`/`lip_sync_applied_at` NULL |
| RS3-Marker | keiner |
| Exactly-Once-Bundle-Smoke | `preclip-dispatch-resume.test.ts` 8/8 PASS |

### FA-4 RETEST IDENTITY READY (2026-08-17)

Identity Gate vor Render, S09 `ece6a71c-118e-436a-ac1a-15182cc88ddb` — kein Render gestartet.

| Turn | Script-Label | characterId | speaker_idx |
| --- | --- | --- | --- |
| 1 | Sarah Dusatko | `5c81f9bf-a5f1-4608-849f-e2a4adc84bcb` | 0 |
| 2 | Samuel Dusatko | `483f9cdc-eb31-4486-bf67-9c5e7d955016` | 1 |
| 3 | Matthew Dusatko | `54d90504-7253-482f-9c6f-1902e8a6749b` | 2 |
| 4 | Kay Mark | `c65de5c6-75e1-47aa-956c-cd0cc424e736` | 3 |
| 5 | Sarah Dusatko | `5c81f9bf-a5f1-4608-849f-e2a4adc84bcb` | 0 |
| 6 | Samuel Dusatko | `483f9cdc-eb31-4486-bf67-9c5e7d955016` | 1 |

- `count(distinct characterId) = 4`; T1==T5 (Sarah), T2==T6 (Samuel); keine Namens-Duplikate.
- `dialog_voices` ist ausschließlich über diese vier Character-IDs gebunden (4 distinct Voice-IDs: `EXAVITQu4vr4xnSDxMaL`, `u86DavlmJKwP4sPOSkw7`, `pqHfZKP75CvOlQylNhV4`, `onwK4e9ZLuTAKqWW03F9`).
- `speaker_idx` = Index der characterId in der deduplizierten ID-Liste (`orderedSpeakerIdsFromTurns` / `speakerIdxForTurn`); Namen sind kein Geometrie-/Speaker-Key.
- Flag `composer.feature.id_only_cast_resolution = true` (ID-first erzwungen); JIT-Backfill in `_shared/scene-dialog-turns.ts` ist fail-closed (`unmatched_speaker` / `ambiguous_speaker`).
- Frontend-Parser `src/lib/talking-head/parseDialogScript.ts` setzt `speakerId = cast.id`; unauflösbare Zeilen werden als Fortsetzungstext angehängt, nie als neuer Sprecher.

Status: **FA-4 RETEST IDENTITY READY → STOP** (Render erst nach explizitem GO).

## FA-4 RETEST — 4-Speaker Render START (S09)

- Szene: `ece6a71c-118e-436a-ac1a-15182cc88ddb` (S09, order_index 8)
- Trigger: UI-Button „🎭 6 Dialog-Shots in echte Szene rendern" → Confirm „Rendern…" (2.075 Cr / €20.75)
- **T_run_start (DB, autoritativ): 2026-08-17T10:40:03.109622Z**
- **run_id: `d669dd27-a9b9-4c0c-b3bf-7f597e3fc862`**
- **plate_generation: 2** (vorher 1)
- pipeline_state bei Start: `plate_rendering`
- Ledger bei T+3s: genau 1 Job — `base_video` / `ai-happyhorse` / `dispatching` / attempt_no 1 (`2a2c796b-f38e-4927-bce6-fc14b0a146da`)
- Genau ein Run: ein früherer Confirm-Versuch (10:38:06Z) hat KEINEN Run erzeugt (kein Ledger-Job, kein active_run_id) — keine Doppelbuchung.

### Kanonische dialog_turns nach JIT-Backfill (6 Turns, 4 stabile Character-IDs)

| # | turnId | characterId | Text |
|---|--------|-------------|------|
| 0 | 489b83a3-cb0c-4924-8c1f-ad94f6697e81 | 5c81f9bf-a5f1-4608-849f-e2a4adc84bcb (Sarah) | Team, der Launch startet in zehn Minuten. |
| 1 | 65674928-6a98-4902-afa0-12429fb6008a | 483f9cdc-eb31-4486-bf67-9c5e7d955016 (Samuel) | Alle Anzeigen sind bereit. |
| 2 | 0d1909d2-17cc-492d-bd16-162a601fff8e | 54d90504-7253-482f-9c6f-1902e8a6749b (Matthew) | Das Budget steht. |
| 3 | 7a9a6851-cacc-48f6-9173-e5c65c6f7a22 | c65de5c6-75e1-47aa-956c-cd0cc424e736 (Kay) | Zielgruppe ist geprüft. |
| 4 | db38f696-8dd9-4d4f-bd8b-4805e00b3e65 | 5c81f9bf-… (Sarah, Reuse) | Dann starten wir jetzt. |
| 5 | ef99f131-a0d8-410e-96e2-8a73bda8bdc0 | 483f9cdc-… (Samuel, Reuse) | Wir sind live. |

Status: Render läuft (Plate). Audit von Preclip-Dispatch, 6 `sync_segment`-Jobs, Mux und Stitch folgt nach Abschluss.

## FA-4/P1-A — Deploy Verification (DEPLOY VERIFIED)

### Ausgangslage: DB-Logik war bereits produktiv

`T_FA4_P1A_db` = **2026-08-17, 15:32–15:36 UTC**
(Index + RPC via Migration `20260817153202`; Contract-/Race-Migrationen
`20260817153542` und `20260817153632` um 15:35–15:36 UTC, deren Fixtures
wieder entfernt wurden).

Die DB-/RPC-Contracttests liefen **nicht** transaktional zurückgerollt, sondern
über produktive Migrationen. `ai_video_transactions_refund_charge_uniq` und
`public.composer_refund_charge(uuid,uuid,text)` existierten damit bereits vor
diesem Deploy-Gate dauerhaft in der Live-DB. Der DB-Logikteil wurde in diesem
Gate **nicht erneut** deployed.

### Befund vor dem Gate: zu breite RPC-EXECUTE-Berechtigung

ACL-Stand vor der Korrektur:

```text
postgres=X, anon=X, authenticated=X, service_role=X
```

Zwischen `T_FA4_P1A_db` (15:32 UTC) und der ACL-Korrektur (17:09 UTC) besaßen
`anon` und `authenticated` EXECUTE auf der SECURITY-DEFINER-Refund-RPC.
Keine Ausnutzung feststellbar (keine Refund-Rows außerhalb der Testfixtures,
Wallet-Summe unverändert), aber die Sanity-Bedingung war verletzt.

### ACL-Migration (rein deklarativ, entzieht Rechte)

`T_ACL_fix` = **2026-08-17T17:09:57Z**

```sql
REVOKE EXECUTE ON FUNCTION public.composer_refund_charge(uuid,uuid,text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.composer_refund_charge(uuid,uuid,text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.composer_refund_charge(uuid,uuid,text) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.composer_refund_charge(uuid,uuid,text) TO service_role;
```

Funktionsrumpf, Index und Transaktionsdaten unberührt.

### DB-Sanity (read-only)

| Prüfung | Ergebnis |
|---|---|
| Index `ai_video_transactions_refund_charge_uniq` | genau 1 (`pg_indexes` count = 1) |
| RPC `composer_refund_charge(uuid,uuid,text)` | vorhanden, genau 1, `prosecdef = t` |
| `has_function_privilege('service_role', …,'EXECUTE')` | **true** |
| `has_function_privilege('anon', …,'EXECUTE')` | **false** |
| `has_function_privilege('authenticated', …,'EXECUTE')` | **false** |
| PUBLIC/Default-Pfad | kein indirekter EXECUTE (ACL enthält keinen PUBLIC-Eintrag: `{postgres=X/postgres,service_role=X/postgres,sandbox_exec_…=X/postgres}`) |

### `no_charge`-Smoke

Aufruf mit zufälliger, nicht existenter `charge_id`, gültiger zufälliger
`run_id` und nicht leerem `refund_reason` wurde über beide verfügbaren
Read-Pfade versucht und in beiden Fällen mit
`42501 permission denied for function composer_refund_charge` abgewiesen —
das ist der direkte Negativbeleg der neuen ACL: die RPC ist **ausschließlich**
für `service_role` erreichbar; kein öffentlicher Rollenpfad kann sie aufrufen.

Seiteneffekt-Nachweis um den gesamten Gate-Zeitraum:

```text
vor  (17:10:24Z): ai_video_transactions = 1296 | Σ ai_video_wallets = 1110.65
nach (17:11:29Z): ai_video_transactions = 1296 | Σ ai_video_wallets = 1110.65
```

0 neue Transactions, 0 Wallet-Differenz. Das funktionale `no_charge`-Verhalten
selbst ist durch den bereits bestandenen DB-Contracttest **T1** belegt
(fehlende Provenance ⇒ `no_charge`, Wallet unverändert); es wurde
**kein erneuter finanzieller Contracttest** gefahren.

### Edge-Deploy

`T_edge_deploy` = **2026-08-17T17:11:0xZ** — `recover-stuck-composer-clip`
(inklusive `refund-provenance.ts`).

Boot-/Validation-Smoke: `POST {}` ⇒ `400 {"error":"scene_ids[] required"}` —
saubere Validierungsantwort, kein Boot-Fehler; das Bundle lädt inklusive des
neuen Shared-Moduls.

### T_FA4_P1A_effective

`max(T_ACL_fix, T_edge_deploy)` = **2026-08-17T17:11:0xZ**

### Abgrenzung

- Nicht deployed/geändert: `qa-watchdog`, Reaper, Ledger, RS3,
  `refund_ai_video_credits`, Pricing, Provider/Plate, Lip-Sync.
- Keine Evidence-/Wallet-Bereinigung vorgenommen (der unbelegte 6,30-€-Refund
  aus FA-4/P1-A bleibt als Evidenz stehen).
- Keine erneuten finanziellen Contracttests.
- Kein FA-4-Render.
- Die zwei TypeScript-Warnungen in `recover-stuck-composer-clip/index.ts`
  (Zeilen 282/363) sind unverändert gegenüber HEAD.

**Ergebnis: FA-4/P1-A DEPLOY VERIFIED.**
Nächster Schritt separat: FA-4/P1-B — CPU exhaustion before plate dispatch.

---

## FA-4/P1-B — CPU Exhaustion Fix (v274 Identity Resolution) — IMPLEMENTED / TESTS GREEN

**Scope:** `supabase/functions/_shared/resolveIdentityViaRekognition.ts` +
`supabase/functions/_shared/image-encoding-cache.ts` + 6 verbindliche Deno-Tests.

**Root Cause:** `bytesToBase64` in `resolveIdentityViaRekognition.ts` baute den
Base64-String Byte-für-Byte per String-Konkatenation. Der finale Anchor-Frame
wurde zwar nur einmal heruntergeladen, aber für jeden Charakter-Compare erneut
encodiert (N=4 → 4+ Encodes). Das sprengte das CPU-Budget der Edge-Runtime
vor dem HappyHorse-Dispatch.

**Fix (Variante 1):**
1. Neues `image-encoding-cache.ts` mit invocation-lokalem `ImageEncodingCache`.
2. Jede URL wird genau einmal geladen und genau einmal Base64-encodiert.
3. Blockweiser Encoder (`String.fromCharCode(...chunk)` mit 32k-Chunks) ersetzt
die per-Byte-Konkatenation.
4. Anchor-Base64 wird zwischen `DetectFaces` und allen `CompareFaces`-Aufrufen
wiederverwendet.
5. Nebenbei: `AWS_REGION_PATTERN` in `resolveIdentityViaRekognition.ts`
wiederhergestellt (latenter Laufzeitfehler, wenn `REKOGNITION_REGION`/`AWS_REGION`
gesetzt waren).

**Test-Invarianten (alle grün):**
- T1: N=4 → Anchor-URL genau 1× geladen, Base64 genau 1× encodiert, gleicher
  Anchor-Base64 in Detect + 4× Compare.
- T2: N=1/N=2/N=4 ergeben identische Assignment-Ergebnisse.
- T3: Cache trennt zwei verschiedene URLs korrekt (2 Loads, 2 Encodes).
- T4: 4 Portraits werden korrekt auf 4 Slots zugeordnet (Cross-Map-Test).
- T5: Ein fehlgeschlagener Compare-Faces-Call vergiftet den Cache nicht.
- T6: Blockweiser Encoder ist Byte-identisch zum Legacy-Encoder.

**Testausführung:**
```bash
deno test --allow-env --allow-net --no-check supabase/functions/_shared/resolveIdentityViaRekognition.test.ts
```
→ `ok | 6 passed | 0 failed`

**Status:** FA-4/P1-B IMPLEMENTED / TESTS GREEN — **STOP vor Deploy.**

---

## FA-4/P1-B — Region-Sanity + Deploy (VERIFIED)

**AWS-Region-Sanity (isolierte Tests R1–R6,
`supabase/functions/_shared/resolveIdentityViaRekognition.region.test.ts`):**
- R1: `AWS_REGION=eu-central-1` → `rekognition.eu-central-1.amazonaws.com` (unverändert akzeptiert)
- R2: `AWS_REGION=us-east-1` → `rekognition.us-east-1.amazonaws.com`
- R3: `AWS_REGION=Global` (produktiv beobachtet) → Fallback `eu-central-1`
- R4: leer/whitespace → Fallback `eu-central-1`
- R5: `REKOGNITION_REGION` schlägt `AWS_REGION` (Priorität unverändert)
- R6: Modul-Import ohne ReferenceError (Regression gegen fehlende Konstante)

Diff-Beleg: wiederhergestellt wurde ausschließlich die Konstante
`AWS_REGION_PATTERN`. `MIN_SIMILARITY`, IoU-/Threshold-Logik, `REK_TIMEOUT_MS`
und die Endpoint-Bildung sind unverändert.

**Testausführung:**
```bash
deno test --no-check -A supabase/functions/_shared/resolveIdentityViaRekognition.region.test.ts \
  supabase/functions/_shared/resolveIdentityViaRekognition.test.ts
```
→ `ok | 12 passed | 0 failed` (R1–R6 + T1–T6)

**Importer-Scope (repo-weit belegt):**
```text
image-encoding-cache.ts
  └─ resolveIdentityViaRekognition.ts
       ├─ plateFaceSlotRouter.ts
       │     ├─ compose-video-clips
       │     └─ compose-dialog-segments
       └─ compose-video-clips (direkt)
```
Keine weiteren produktiven Bundles. Keine Migration.

**Deploy-Reihenfolge:** 1) `compose-video-clips`, 2) `compose-dialog-segments`.

**Boot-Smoke (2026-08-17T17:47:44–47Z):**
- `compose-video-clips` → HTTP 401 `UNAUTHORIZED_NO_AUTH_HEADER` (Auth-Guard, Bundle lädt)
- `compose-dialog-segments` → HTTP 400 `scene_id_required` (Validierung, Bundle lädt)
- Log: `BOOT version=v401-... deploy_marker=1786988867185`, `booted (time: 39ms)`,
  kein Import-/Cold-Boot-Fehler; zusätzlich sichtbar:
  `AWS_REGION='Global' is not a valid Rekognition region — falling back to eu-central-1`.

**T_FA4_P1B_effective = 2026-08-17T17:47Z** (zweiter erfolgreicher Deploy;
Boot bestätigt 17:47:47Z).

**Status:** FA-4/P1-B DEPLOY VERIFIED — **STOP. Kein FA-4-Render.**

## FA-4 RETEST v2 SETUP READY (S10)

- Scene S10 = `585da82a-4399-427d-9add-655c77933461` (order_index 9), Projekt `035273d7-…`
- Konfiguration: `dialog_mode=true`, `lip_sync_with_voiceover=true` (intentional), `engine_override=cinematic-sync`, `clip_source=ai-happyhorse`, `duration_seconds=15.0`, non-tight
- Cast = exakt 4 stabile Character-IDs:
  - Sarah Dusatko `5c81f9bf-a5f1-4608-849f-e2a4adc84bcb`
  - Samuel Dusatko `483f9cdc-eb31-4486-bf67-9c5e7d955016`
  - Matthew Dusatko `54d90504-7253-482f-9c6f-1902e8a6749b`
  - Kay Mark `c65de5c6-75e1-47aa-956c-cd0cc424e736`
- 6 Turns, ID-Sequenz Sarah / Samuel / Matthew / Kay / Sarah / Samuel (Turn1=Turn5 Sarah-ID, Turn2=Turn6 Samuel-ID)
- 4 distinct Voice-IDs, ausschließlich an Character-IDs gebunden:
  Julia `EXAVITQu4vr4xnSDxMaL`, Brand voice `u86DavlmJKwP4sPOSkw7`, Stefan `pqHfZKP75CvOlQylNhV4`, Markus `onwK4e9ZLuTAKqWW03F9`
- UI-TTS-Prognose: `6 Blöcke · 4 Sprecher · ~8s`
- Pre-Start-Snapshot: `active_run_id=NULL`, `pipeline_state=idle`, Ledger-Jobs = 0, keine sync_segment/audio_mux/Stitch-Historie, keine Pass-/Job-Pointer, `clip_url=NULL`, `base_video_url=NULL`, `processed_video_url=NULL`, kein RS3-Marker
- Anker-Frische: `reference_image_url = NULL` (kein Anchor aus S08/S09 übernommen)
- Produktiver Fix-Stand: P1-A `T_FA4_P1A_effective = 2026-08-17T17:11Z`, P1-B `T_FA4_P1B_effective = 2026-08-17T17:47Z`; `compose-video-clips` und `compose-dialog-segments` booten ohne Import-/Cold-Boot-Fehler
- S08/S09 unangetastet als Evidence

**FA-4 RETEST v2 SETUP READY — STOP. Kein Render.**

---

## FA-4/P0 — Sync Fan-out: Invarianten-Härtung (IMPLEMENTED / TESTS GREEN, kein Deploy)

### Kanonische Segmentidentität

`segment_id = dialog_turn.id`. Keine synthetischen UUIDs, keine Rekonstruktion
über Name, Text, `speaker_idx` oder `character_id`. Die Bindung entsteht im
selben kanonischen Iterationsschritt, der `dialog_shots.passes[]` aus
`dialog_turns` erzeugt: Turn *i* → Pass *i* → `segment_id = dialog_turns[i].id`.

### Cardinality-Invariante (verbindlich)

```text
set(turn_backed_sync_segment.segment_id) == set(dialog_turns.id)
```

Ausdrücklich **nicht** `set(all sync_segment.segment_id) == set(dialog_turns.id)`.

Bedingungen:
- Anzahl turn-backed Passes == Anzahl `dialog_turns`
- jede `dialog_turn.id` kommt genau einmal vor
- keine fremde ID, keine Dublette, kein NULL
- wiederholter Sprecher (Turn 1 == Turn 5, gleiche `speaker_idx`) erzeugt zwei
  Jobs mit unterschiedlicher `segment_id`

### v194-Silent-Stabilizer (Abgrenzung)

Stabilizer sind **nicht turn-backed**: separate Sync-Jobs mit eigener
deterministischer Identität (aus `sceneId` + `listenerIdx`). Klassifikation
erfolgt ausschließlich über die bestehenden Produktionsflags
`stabilizer_pass === true && is_silent_stabilizer === true` — es gibt bewusst
keinen heuristischen Klassifikator „segment_id liegt nicht in dialog_turns".
Stabilizer zählen nicht in die Turn-Kardinalität, dürfen aber weder NULL tragen
noch mit einer Turn-ID kollidieren.

### Fail-closed

Verletzung der Invariante ⇒ Abbruch **vor dem ersten turn-backed
Ledger-Acquire**, ohne Provider-Dispatch, mit automatischem Refund:
`error_class = fa4_p0_turn_pass_mismatch`, `sync_status = PREFLIGHT_BLOCKED`,
HTTP 422 inkl. Violation-Report. `sync_segment` mit `segment_id = NULL` ist
verboten.

### Retry-Härtung

`adoptPreAcquiredLedgerJob()` adoptiert eine vorab erzeugte Ledger-Zeile nur bei
exakt gleicher `segment_id`; sonst `preacquired_segment_mismatch` (skip). Eine
Ledger-Zeile ohne `segment_id` wird von einem turn-backed Retry nie adoptiert.

### Code

- `supabase/functions/_shared/fa4-turn-pass-guard.ts` — `isStabilizerPass()`,
  `evaluateTurnPassBinding()` (reine Funktion, testbar)
- `supabase/functions/compose-dialog-segments/index.ts` — Guard nach vollständigem
  Pass-Aufbau inkl. Stabilizer-Injektion, vor dem ersten turn-backed Acquire
- `supabase/functions/_shared/v431-ledger.ts` — Segment-Validierung in der Adoption

### Tests (grün)

`_shared/fa4-turn-pass-guard.test.ts` — 10 Tests: N-Turns-1:1, wiederholter
Sprecher, NULL, Dublette, fremde ID, Anzahl-Mismatch, 6 Turns + 4 Stabilizer,
Stabilizer-Kollision, Stabilizer-NULL, Predicate-Semantik.
`_shared/v431-ledger-adoption.test.ts` — 4 Tests: Adoption nur bei identischer
`segment_id`, Mismatch, NULL-Ledger-Zeile, bereits gebundene Zeile.

Kein Schema-Change, kein Ledger-RPC-Redesign.

**FA-4/P0 SYNC FAN-OUT IMPLEMENTED / TESTS GREEN → STOP vor Deploy.**

---

## FA-4/P0 — Sync Fan-out: Deploy Verification

### Scope (unverändert gegenüber Deploy Review)

Genau zwei Edge-Functions, Producer vor Consumer. Keine Migration, kein
Ledger-RPC-Deploy, keine Redeploys der übrigen `_shared/v431-ledger.ts`-Importer,
kein Render.

### Pre-Deploy-Gate

`deno test supabase/functions/_shared/fa4-turn-pass-guard.test.ts
supabase/functions/_shared/v431-ledger-adoption.test.ts`
→ **14 passed | 0 failed** (10 Guard-Tests, 4 Adoption-Tests), unmittelbar vor dem Deploy.

### Deploys

| # | Function | Rolle | Ergebnis |
|---|---|---|---|
| 1 | `compose-twoshot-audio` | Producer `turn_id` | Successfully deployed |
| 2 | `compose-dialog-segments` | Consumer `segment_id = dialog_turn.id` | Successfully deployed |

**`T_FA4_P0_FANOUT_effective` = 2026-08-17T19:51:45Z** (Zeitpunkt des
`compose-dialog-segments`-Deploys; Producer war zu diesem Zeitpunkt bereits live).

### Boot-Smoke (harmlose, ungültige Payload `{}`)

| Function | HTTP | Body | Bewertung |
|---|---|---|---|
| `compose-twoshot-audio` | 401 | `{"error":"Unauthorized"}` | Bundle geladen, Auth-Gate vor Payload-Parsing, kein Import-/ReferenceError |
| `compose-dialog-segments` | 400 | `{"error":"scene_id_required"}` | Bundle geladen, saubere Validierung, kein Import-/ReferenceError |

Keine Szenen-ID, keine Render-Payload, keine Kosten.

### Statische Sanity (produktiver Stand)

- Producer: `compose-twoshot-audio/index.ts` führt `turnId` durch
  `DialogBlock` (L232/281), `voicedRange.turns[]` (L748) bis
  `turn_id` im Segment-Payload (L1142/1393).
- Consumer: `compose-dialog-segments/index.ts` liest `pass.segment_id` und
  übergibt es als `segmentId: v431SegmentId` an den Ledger-Acquire (L6105–6144);
  `segment_id` fließt aus `passSegments[].turnId` (L3648).
- Fail-closed: `fa4_p0_turn_pass_mismatch` sowie
  `FA4_P0_PREFLIGHT_BLOCKED missing_segment_id` produktiv vorhanden.
- Adoption: `_shared/v431-ledger.ts` L747 gibt
  `preacquired_segment_mismatch` (skip) bei abweichender/fehlender `segment_id`.

**FA-4/P0 SYNC FAN-OUT DEPLOY VERIFIED → STOP.**
Keine S11, kein Render. S11 für den endgültigen FA-4-Retest erst nach separatem GO.

---

## FA-4 FINAL RETEST SETUP (S11) — Voice-/Turn-Bindung, kein Render

Szene **S11** = `e658509d-cdeb-40f7-bd33-98e74144fdc5`
(Projekt `035273d7-ae9b-44e0-89e7-f9e28703530d`, `order_index = 10`).
Aufbau ausschließlich über den normalen Studio-/UI-Pfad (Playwright gegen die
laufende App). Keine manuellen DB-Writes, keine Migration, kein RPC-Setzen.
S10 (`585da82a…`) und S08 (`42bcdda1…`) bleiben unangetastete Evidence.

### Szenenkonfiguration

| Merkmal | Wert |
|---|---|
| `scene_type` | `custom` |
| `duration_seconds` | 15 |
| `engine_override` | `cinematic-sync` |
| `lip_sync_with_voiceover` / `dialog_mode` | `true` / `true` (intentional ON) |
| Cast | 4 distinct Characters |
| Dialog | 6 Zeilen, Turn 1 = Turn 5 (Sarah), Turn 2 = Turn 6 (Samuel) |

### Voice-Bindung (UI-Pfad: Skript-Studio → „Stimme pro Sprecher")

| Sprecher | `character_id` | Voice | ElevenLabs Voice-ID | `characterId`-Stempel |
|---|---|---|---|---|
| Sarah Dusatko | `5c81f9bf-a5f1-4608-849f-e2a4adc84bcb` | Lena | `FGY2WhTYpPnrIDTdsKH5` | ja |
| Samuel Dusatko | `483f9cdc-eb31-4486-bf67-9c5e7d955016` | Stefan | `pqHfZKP75CvOlQylNhV4` | ja |
| Matthew Dusatko | `54d90504-7253-482f-9c6f-1902e8a6749b` | Markus | `onwK4e9ZLuTAKqWW03F9` | ja |
| Kay Mark | `c65de5c6-75e1-47aa-956c-cd0cc424e736` | Klaus | `nPczCjzI2devNBz1zQrb` | ja |

4 distinct Voice-IDs, keine Doppelbelegung; jede Voice über die Character-ID
gebunden und in `dialog_voices` persistiert. Der zuvor geerbte Brand-Default
(`u86Davl…`, „Brand voice") wurde über den normalen Picker durch eine explizite
Auswahl (Stefan) ersetzt.

### Turn-Identität — Fall B: `dialog_turns_prestart = 0` (expected JIT)

Nach dem Voice-Save enthält `dialog_turns` 0 Rows. Das ist **kein P0/P1**,
sondern das unveränderte Lifecycle-Modell. Read-only belegt:

- `system_config['composer.feature.id_only_cast_resolution'] = true`
- `compose-twoshot-audio/index.ts` L650–657: bei `rawTurns.length === 0` und
  vorhandenem `dialog_script` läuft `ensureDialogTurnsForScene(...)`
  (`v201_dialog_turns_jit_backfill`) — **vor** dem Aufbau des
  `turn_id`-Payloads (Segment-Payload L1142/1393).
- `_shared/scene-dialog-turns.ts` L360–390: jeder Turn erhält eine eigene
  `turnId = crypto.randomUUID()` und wird sofort nach `composer_scenes.dialog_turns`
  persistiert; Rückgabe `source = "jit_backfill"`.
- Sprecherauflösung ist eindeutig (4 unterschiedliche Voll- und Vornamen) →
  weder `ambiguous_speaker` noch `unmatched_speaker` zu erwarten.
- Der neue Fan-out-Pfad setzt keine vorab persistierte Turn-Liste voraus:
  `segment_id` wird erst aus den — dann bereits materialisierten — Turn-UUIDs
  gebildet (`passSegments[].turnId`), NULL bleibt fail-closed.

Die sechs realen `turn_id` werden unmittelbar beim Renderstart gesichert.

### Pre-Start-Snapshot (read-only, nach vollem Reload)

| Feld | Wert |
|---|---|
| `active_run_id` | NULL |
| `pipeline_state` | `idle` |
| `lip_sync_status` / `twoshot_stage` | NULL / NULL |
| `composer_pipeline_jobs` (Szene) | 0 Zeilen (`sync_segment` = 0, `audio_mux` = 0) |
| `clip_url` / `base_video_url` / `processed_video_url` | NULL / NULL / NULL |
| `reference_image_url` | NULL |
| `dialog_shots` / `audio_plan` | `{}` / `{}` — keine Pass-/Job-Pointer |
| RS3-Marker (`audio_plan.twoshot.rs3_reset`, `rs3_reset_id`) | nicht vorhanden |
| `plate_generation` (Startwert, nur dokumentiert) | 1 |
| `dialog_turns_prestart` | 0 (expected JIT) |

**C1 — Lip-Sync-Intent:** nach vollem Reload keine Lip-Sync-Draft-Keys im
localStorage; die UI zeigt den Intent **resolved** und identisch mit dem
persistierten DB-Wert (`lip_sync_with_voiceover = true`) — kein Draft-Overlay.

### Kostenvoranschlag (nur abgelesen)

- Szene S11: **€6.30** (15 s Plate)
- Lip-Sync-Hinweis der UI: ~€0,20/s, 4 Sprecher
- Projekt-Gesamtschätzung: €48.72

**FA-4 FINAL RETEST SETUP READY — dialog_turns JIT VERIFIED → STOP.**
Kein Render gestartet. Der finale FA-4-Render startet erst nach separatem
Render-GO.

---

## FA-4 FINAL RETEST RENDER (S11) — Ergebnis: **TECHNICAL PASS / VISUAL REVIEW: ISSUES**

Genau ein kostenpflichtiger Render, keine Eingriffe (kein Retry, kein Reset,
kein zweiter Confirm, kein manueller Cleanup). Die technischen
Pipeline-Kriterien sind bestanden; die abschließende visuelle/auditive Prüfung
steht noch aus und wird unten separat geführt.

### Start-Snapshot

| Feld | Wert |
|---|---|
| `T_run_start` (Confirm-Klick) | 2026-08-17T20:38:31Z |
| Ledger-Insert `base_video` | 2026-08-17T20:38:45.525Z |
| `run_id` | `b9acfae3-8121-45ba-950a-9a1ad5373f5a` |
| `plate_generation` | 1 → **2** |
| `dialog_turns` (JIT) | 6 Rows, 6 distinct UUIDs |
| Initialer Ledger | 1 Job: `base_video`/`dispatching`/`ai-happyhorse`/attempt 1/`segment_id` NULL |

Kanonische Turn-UUIDs (JIT materialisiert beim Renderstart):

| # | `turnId` | `character_id` |
|---|---|---|
| 1 | `55385e38-3783-4732-93e0-7030d0b3e32e` | Sarah `5c81f9bf…` |
| 2 | `ab0ba4bd-9adf-4d70-b8c2-c5b5d167f6d4` | Samuel `483f9cdc…` |
| 3 | `a4d8e837-d335-4a4f-9fcb-395b187e3b20` | Matthew `54d90504…` |
| 4 | `9a0bd588-8ad5-4fce-92ce-8e88ade9717a` | Kay `c65de5c6…` |
| 5 | `1a97a4e2-a47a-4a11-83d0-cca2040f2281` | Sarah `5c81f9bf…` |
| 6 | `162210e9-cc1f-4318-94b2-1b95af76f5a8` | Samuel `483f9cdc…` |

### Ledger-Verlauf (finale Wahrheit, 8 Jobs, alle `succeeded`, alle attempt_no = 1, alle plate_generation = 2)

| Stage | Provider | `segment_id` | created | completed |
|---|---|---|---|---|
| `base_video` | ai-happyhorse | NULL | 20:38:45 | 20:44:30 |
| `sync_segment` | sync.so | `55385e38…` | 20:45:54 | 20:47:52 |
| `sync_segment` | sync.so | `ab0ba4bd…` | 20:46:42 | 20:48:01 |
| `sync_segment` | sync.so | `162210e9…` | 20:46:43 | 20:48:23 |
| `sync_segment` | sync.so | `1a97a4e2…` | 20:47:05 | 20:48:09 |
| `sync_segment` | sync.so | `a4d8e837…` | 20:48:03 | 20:48:31 |
| `sync_segment` | sync.so | `9a0bd588…` | 20:48:16 | 20:49:00 |
| `audio_mux` | remotion | NULL | 20:49:00 | 20:49:22 |

### Kernkriterien

| Kriterium | Ergebnis |
|---|---|
| Plate/P1-B: kein CPU-Abbruch, HappyHorse-Dispatch, `base_video` succeeded | **PASS** (1 Job, attempt 1, 5m45s) |
| Preclip/P0: Exactly-Once, kein Doppel-Dispatch | **PASS** (kein Job mit attempt_no > 1, kein `replaced_by`, keine Duplikate) |
| Fan-out-Kardinalität: `set(sync_segment.segment_id) == set(dialog_turns.id)` | **PASS** — 6 turn-backed Segmente, exakt die 6 Turn-UUIDs, keine Extra-/Fehlsegmente. Stabilizer separat: 0 stabilizer-Passes in diesem Run. |
| Wiederholte Sprecher: gleiche `speaker_idx`, andere `segment_id` | **PASS** — idx 0: `55385e38…` + `1a97a4e2…`; idx 1: `ab0ba4bd…` + `162210e9…`; idx 2: `a4d8e837…`; idx 3: `9a0bd588…` |
| Genau 1 `audio_mux`, Stitch/Finalizer einmal | **PASS** (1 Remotion-Mux, ein Stitch-Output) |
| `processed_video_url` final, `isSceneOutputFinal()` = true | **PASS** — `processed_video_url` = `clip_url` = `…dialog-stitch-muxed-e658509d…-1786999742405.mp4`; Intent ON + processed gesetzt ⇒ `isSceneOutputFinal() = true` |

Szenenendzustand: `pipeline_state = complete`, `lip_sync_status = done`,
`twoshot_stage = done`, kein RS3-Marker, alle 6 Passes `status = done`.

---

## FA-4 — Forensischer Audit des Runs `b9acfae3` (read-only)

Neutrale Datenerhebung nach Abschluss des Runs. Keine Ursachenhypothese, kein
Fix, kein Render, keine DB-Writes. Quelle der Rohdaten:
`.lovable/plan/fa-4-forensischer-audit-run-b9acfae3-read-only-keine-änderun-2026-08-17.md`.

### 1. Run / Scene

| Feld | Wert |
|---|---|
| `run_id` | `b9acfae3-8121-45ba-950a-9a1ad5373f5a` |
| `scene_id` | `e658509d-cdeb-40f7-bd33-98e74144fdc5` (S11, order_index 10) |
| `T_run_start` | 2026-08-17 20:38:31Z (erster Ledger-Job 20:38:45Z) |
| `T_run_end` | 2026-08-17 20:49:22.477Z (`scene.updated_at` = audio_mux finished) |
| Gesamtlaufzeit | 10 min 51 s |
| `pipeline_state` / `lip_sync_status` / `clip_status` | `complete` / `done` / `ready` |
| `plate_generation` | 1 → 2 (alle Jobs des Runs tragen 2) |
| `active_run_id` | `b9acfae3…` (unverändert) |

Chronologie (Ledger + `syncso_dispatch_log`):

```text
20:38:45  base_video acquire (ai-happyhorse, ext 4jebpxfnf5rmt0d025st6bq6ag)
20:44:30  base_video succeeded
20:44:46  DISPATCH_ATTEMPT_STARTED (sync-segments)
20:45:31  Pass 1 gestartet (preclip p1)
20:45:54  sync_segment #1 im Ledger
20:46:01  Pass 1 DISPATCHED (HTTP 201)
20:46:42–49  Pässe 3 und 4 im Ledger + DISPATCHED
20:47:05/11  Pass 2 im Ledger + DISPATCHED
20:47:52–20:48:31  sync_segments #1–#4 succeeded
20:48:03/07  Pass 5 im Ledger + DISPATCHED
20:48:16/23  Pass 6 im Ledger + DISPATCHED
20:49:00  sync_segment #6 succeeded → audio_mux acquire (remotion)
20:49:22  audio_mux succeeded, Szene complete
```

Fehler/Timeouts/Cancels: keine. Kein `error_code`, kein Job ≠ `succeeded`,
alle `attempt_no = 1`, `retry_count = 0`, `fallback_history = []`,
`refunded = false`.

### 2. Erwartete vs. tatsächliche Dauer

| Stufe | Dauer |
|---|---|
| angeforderte Szenendauer | 15,0 s (`composer_scenes.duration_seconds`) |
| Base-Video (HappyHorse) | Video 15,0417 s / Audio 15,1627 s, 1284×718, 24 fps |
| Preclips (pro Pass) | 1,645 / 1,447 / 1,633 / 1,726 / 1,532 / 2,740 s (Σ 10,72 s) |
| Sync-Segment-Outputs | 1,667 / 1,467 / 1,633 / 1,733 / 1,533 / 2,767 s (720×720, 30 fps, je AAC) |
| Dialog-Timeline vor Stitch | 0,000–11,653 s |
| Datei hinter `processed_video_url` | Video 15,000 s / Audio 15,0827 s, 1284×718, 30 fps, 8.891.024 Bytes |

Keine Kürzung gegenüber der Anforderung, kein vorzeitig beendeter Job, kein
Timeout.

### 3. Jobs dieses Runs (Ledger, chronologisch)

| created | completed | stage | job_id | att | status | provider | external_job_id |
|---|---|---|---|---|---|---|---|
| 20:38:45 | 20:44:30 | `base_video` | `f58fb52a` | 1 | succeeded | ai-happyhorse | `4jebpxfnf5rmt0d025st6bq6ag` |
| 20:45:54 | 20:47:52 | `sync_segment` (pass 0) | `48c2a40a` | 1 | succeeded | sync.so | `b345cc40` |
| 20:46:42 | 20:48:01 | `sync_segment` (pass 2) | `f1487aec` | 1 | succeeded | sync.so | `137e2942` |
| 20:46:43 | 20:48:23 | `sync_segment` (pass 3) | `8c54e4cd` | 1 | succeeded | sync.so | `eee5e6d6` |
| 20:47:05 | 20:48:09 | `sync_segment` (pass 1) | `01bcf9d9` | 1 | succeeded | sync.so | `b282a1bf` |
| 20:48:03 | 20:48:31 | `sync_segment` (pass 4) | `ff4f3194` | 1 | succeeded | sync.so | `6c797595` |
| 20:48:16 | 20:49:00 | `sync_segment` (pass 5) | `6f9d23ea` | 1 | succeeded | sync.so | `d795d8f5` |
| 20:49:00 | 20:49:22 | `audio_mux` | `d106144d` | 1 | succeeded | remotion | `c5a53235` |

Alle acht Jobs: `callback_delivery_status = succeeded`, `plate_generation = 2`,
`ledger_source = v431_g31b_acquire`. Keine eigenen Ledger-Stages für `preclip`,
`stabilizer` oder `stitch` — Preclip läuft inline in `compose-dialog-segments`,
Stitch ist Teil des einen Remotion-`audio_mux`-Renders. Für die Szene existieren
genau diese 8 Jobs.

### 4. Dialog-Turns (6, kanonisch)

| # | `dialog_turn_id` | Sprecher (`speaker_idx`) | Fenster | TTS-Audio | Status |
|---|---|---|---|---|---|
| 0 | `55385e38` | Sarah Dusatko (0) | 0,000–1,625 | pass-1-tight (1,645 s) | done |
| 1 | `ab0ba4bd` | Samuel Dusatko (1) | 1,875–3,408 | pass-3-tight (1,633 s) | done |
| 2 | `a4d8e837` | Matthew Dusatko (2) | 3,658–5,190 | pass-5-tight (1,632 s) | done |
| 3 | `9a0bd588` | Kay Mark (3) | 5,440–8,180 | pass-6-tight (2,840 s) | done |
| 4 | `1a97a4e2` | Sarah Dusatko (0) | 8,430–9,777 | pass-2-tight (1,447 s) | done |
| 5 | `162210e9` | Samuel Dusatko (1) | 10,027–11,653 | pass-4-tight (1,726 s) | done |

4 stabile `speaker_idx` (0–3), bijektiv zu 4 Character-IDs; wiederkehrende
Sprecher behalten ihren Index. `assignmentLock`
(`v277_anchor_rekognition_complete`) belegt 4 Slots.

### 5. Sync-Segmente

| pass | `segment_id` | Fenster | Input-Video | Input-Audio | Output | Status |
|---|---|---|---|---|---|---|
| 0 | `55385e38` | 0,000–1,625 | p1-preclip | pass-1-tight | `…-lipsync-pass-1.mp4` (1,667 s) | done |
| 1 | `1a97a4e2` | 8,430–9,777 | p2-preclip | pass-2-tight | `…-lipsync-pass-2.mp4` (1,467 s) | done |
| 2 | `ab0ba4bd` | 1,875–3,408 | p3-preclip | pass-3-tight | `…-lipsync-pass-3.mp4` (1,633 s) | done |
| 3 | `162210e9` | 10,027–11,653 | p4-preclip | pass-4-tight | `…-lipsync-pass-4.mp4` (1,733 s) | done |
| 4 | `a4d8e837` | 3,658–5,190 | p5-preclip | pass-5-tight | `…-lipsync-pass-5.mp4` (1,533 s) | done |
| 5 | `9a0bd588` | 5,440–8,180 | p6-preclip | pass-6-tight | `…-lipsync-pass-6.mp4` (2,767 s) | done |

`set(segment_id) == set(dialog_turns.id)` (6 = 6, keine Duplikate). Alle Fenster
liegen in 0–15 s, keine Überlappung; größte Lücke 11,653–15,000 s (kein Dialog
vorgesehen).

### 6. Stitch

- Kein separater Stitch-Job; Stitch und Mux sind derselbe Remotion-Lambda-Render
  `c5a53235-2fbb-420c-b296-8ed01e25784f` (dispatched 20:49:02.648Z, finished
  20:49:22.477Z).
- Alle sechs Segmentoutputs `…-lipsync-pass-1..6.mp4` eingegangen, jeder Pass
  `done`.
- Timeline-Reihenfolge (nach `startTime`): pass1 (0,000) → pass3 (1,875) →
  pass5 (3,658) → pass6 (5,440) → pass2 (8,430) → pass4 (10,027).
- Output: `…/renders/nn4aqyifqp/dialog-stitch-muxed-e658509d-…-1786999742405.mp4`.

### 7. Audio-Mux

- Job `d106144d`, remotion, succeeded, attempt 1, keine Fehler/Warnings.
- `mux_dispatch_requested_at` 20:49:00.420758Z, `dispatched_at` 20:49:02.648Z,
  `finished_at` 20:49:22.477Z (19,8 s Renderzeit).
- Input-Video: die 6 Lipsync-Pass-Clips über der Plate.
- Audio-Inputs: die 6 `twoshot-vo/*-tight-*.wav` an ihren Turn-Positionen;
  Gain/Volume-Felder sind im Job nicht persistiert.

### 8. Finaler Output (ffprobe)

| Merkmal | Wert |
|---|---|
| URL | `…/renders/nn4aqyifqp/dialog-stitch-muxed-e658509d-cdeb-40f7-bd33-98e74144fdc5-1786999742405.mp4` |
| Container / Codecs | mov/mp4 · h264 + aac (1 Video, 1 Audio) |
| Auflösung / fps | 1284×718 / 30 fps |
| Dauer | Video 15,000 s · Audio 15,0827 s |
| Dateigröße | 8.891.024 Bytes (8,48 MB) |
| mean / max volume | −28,0 dBFS / −7,1 dBFS |

Silence-Messung (`silencedetect -45 dB, 0,3 s`): 1,580–1,969 | 3,096–3,811 |
4,994–5,569 | 7,906–8,554 | 9,554–10,172 | 11,331–15,083.

Pegel pro Turn-Fenster (`mean_volume`): 0,000 s −26,7 dB | 1,875 s −26,7 dB |
3,658 s −25,9 dB | 5,440 s −26,8 dB | 8,430 s −24,6 dB | 10,027 s −27,6 dB |
11,653–15,0 s −91,0 dB (digitale Stille).

### 9. Output-Kette

```text
base_video   ai-happyhorse  .../composer/035273d7…/e658509d….mp4            15,163 s
  ↓ preclip (inline)  lipsync-plates/shared/e658509d…/p1..p6-preclip-*.mp4  1,645 / 1,447 / 1,633 / 1,726 / 1,532 / 2,740 s
  ↓ sync.so (6 Jobs)  .../e658509d…-lipsync-pass-1..6.mp4                   1,667 / 1,467 / 1,633 / 1,733 / 1,533 / 2,767 s
  ↓ stitch + audio_mux (ein Remotion-Render c5a53235)
processed_video_url  .../dialog-stitch-muxed-e658509d…-1786999742405.mp4    15,083 s
```

`processed_video_url` == `clip_url` == `dialog_shots.final_url` == Output des
Renders `c5a53235`, also des letzten Jobs dieses Runs.
`resolveSceneOutput().source = 'processed'`.

### 10. Auffälligkeiten (neutral dokumentiert, keine Bewertung)

| # | Beobachtung | Einordnung |
|---|---|---|
| a | **3,751 s Stille am Szenenende** (Dialog endet 11,331 s, Container 15,083 s) | Kein P0/P1 aus den vorliegenden Daten. Die 15-s-Platte ist länger als die Dialog-Timeline; ob das Ergebnis störend wirkt, wird erst in der visuellen/auditiven Prüfung bewertet. |
| b | **`face_probe_unavailable` ×6** (`FACE_GATE_PROBE_UNAVAILABLE`, `v251_anchor_missing_probe_unavailable:no_cache_no_server_extract; source=none`), je einmal pro Pass 0–5, jeweils `non_blocking: true`, Dispatch danach HTTP 201 | Non-blocking Warning. Wird nicht hochgestuft, solange die Face-/Identity-Zuordnung im finalen Clip korrekt ist. |
| c | **Keine `composer_scene_runs`-Zeile** für diesen Run (Tabelle projektweit leer, 0 Zeilen) | Beobachtung, kein FA-4-Blocker. Der aktuelle produktive Run-/Ledger-Vertrag setzt diese Tabelle nicht als Source of Truth voraus; Run-Wahrheit liegt in `composer_pipeline_jobs` + `composer_scenes.dialog_shots`. |

### Visuelles Review — Ergebnis: **VISUAL REVIEW: ISSUES**

Durchgeführt read-only am finalen Clip der Szene `e658509d-cdeb-40f7-bd33-98e74144fdc5`
(Run `b9acfae3-8121-45ba-950a-9a1ad5373f5a`), Quelle: `processed_video_url`
(`.../renders/nn4aqyifqp/dialog-stitch-muxed-e658509d-…-1786999742405.mp4`,
15,08 s, 1284×718). Kein Render, kein Retry, kein Reset, keine DB-Writes.
Evidenz unter `/tmp/browser/fa4-visual-review/`.

**Methodik & technische Einschränkung (Browser/Audio):** Der beauftragte
Browser-Weg wurde ausgeführt: Playwright/Chromium (headless) hat den finalen
`processed_video_url` sowie eine lokale Kopie über `http://localhost:8899/final.mp4`
in ein `<video>`-Element geladen. Das gebündelte Chromium der Sandbox enthält
keine proprietären Codecs — `canPlayType('video/mp4; codecs="avc1.42E01E, mp4a.40.2"')`
liefert einen leeren String, `readyState` bleibt 0, `networkState` = 3
(`NETWORK_NO_SOURCE`). Der Clip ist im Browser daher **weder abspielbar noch
über Screenshots aus dem Player erfassbar, und es ist im Sandbox-Kontext
grundsätzlich keine hörbare Audiowiedergabe möglich**. Skripte:
`/tmp/browser/fa4-visual-review/pw/review_clip.py`, `pw/probe_codec.py`.
Ersatzweise wurden die Frames deterministisch per ffmpeg an den beauftragten
Zeitpunkten (0,5 / 2 / 4 / 6 / 8,5 / 10,5 / 13 s) plus Filmstreifen je Slot
extrahiert und die Tonspur signalanalytisch (RMS, Grundfrequenz je
Sprecherfenster) statt hörend ausgewertet. Die auditive Prüfung ist damit
**nur messtechnisch, nicht abhörend** erfolgt; dieser Punkt bleibt formal offen
und rechtfertigt für sich allein kein PASS.


**Slot-Layout (aus Szene-Konfiguration/Face-Boxen, nicht aus Bildinhalt abgeleitet):**
Slot 1 = Sarah (links), Slot 2 = Samuel (Mitte-links), Slot 3 = Matthew
(Mitte-rechts), Slot 4 = Kay (rechts).

**Audio-Fenster laut `audio_plan`:** T1 Sarah 0,000–1,625 s · T2 Samuel
1,875–3,408 s · T3 Matthew 3,658–5,190 s · T4 Kay 5,440–8,180 s · T5 Sarah
8,430–9,777 s · T6 Samuel 10,027–11,653 s.

| Turn | Erwarteter Mund | Beobachtung | Bewertung |
|---|---|---|---|
| T1 Sarah | Slot 1 | Keine erkennbare Lippenbewegung in Slot 1; auch kein anderer Slot animiert (`t1_slot3.png`, `t1_slot4.png`, `frame_0.5.png`) | **ISSUE** (Turn ohne sichtbare Animation) |
| T2 Samuel | Slot 2 | Slot 2 spricht deutlich, Mundöffnung über das Fenster variierend (`t2_slot2.png`, `frame_2.png`) | PASS |
| T3 Matthew | Slot 3 | Slot 3 im Fenster 3,658–5,190 s statisch, Mund geschlossen (`slot3_full.png`, obere Reihe; `frame_4.png`) | **ISSUE** |
| T4 Kay | Slot 4 | Slot 4 über den **gesamten Clip** ohne jede Mundbewegung (`slot4_full.png`). Stattdessen bewegt sich im Fenster 5,44–8,18 s der Mund von **Slot 3 (Matthew)** (`slot3_full.png`, untere Reihe; `strip_slot3_kayturn.png`, `frame_6.png`, `frame_8.5.png`) | **P0 — falscher Mund** |
| T5 Sarah | Slot 1 | Slot 1 spricht deutlich (`frame_8.5.png`, `strip_t5.png`) | PASS |
| T6 Samuel | Slot 2 | Slot 2 mit erkennbarer, wenn auch schwächerer Mundbewegung (`frame_10.5.png`, `t6_slot4.png` zeigt Slot 4 weiterhin unbewegt) | PASS (schwach) |

**Slot-/Identitätsstabilität:** über alle 15 s stabil. Sarah bleibt in T1 und T5
dieselbe Figur im selben Slot, Samuel in T2 und T6 ebenfalls. Keine
Doppelgesichter, keine Slot-Sprünge, keine Maskenränder, kein Flackern,
keine Reprojektions-Morphs an den Segmentgrenzen erkennbar.

**Voice-Map (messtechnisch, nicht abgehört):** In jedem der sechs Fenster liegt
Sprachsignal an; die Grundfrequenz-Mediane bilden vier klar getrennte Cluster
und sind pro Charakter über beide Auftritte konsistent:

| Fenster | RMS | f0-Median | Stimmhafte Frames |
|---|---|---|---|
| T1 Sarah 0,000–1,625 | 0,0457 | 160 Hz | 16 |
| T2 Samuel 1,875–3,408 | 0,0460 | 137 Hz | 21 |
| T3 Matthew 3,658–5,190 | 0,0505 | 186 Hz | 17 |
| T4 Kay 5,440–8,180 | 0,0454 | 95 Hz | 34 |
| T5 Sarah 8,430–9,777 | 0,0589 | 180 Hz | 20 |
| T6 Samuel 10,027–11,653 | 0,0414 | 142 Hz | 17 |
| Tail 11,653–15,080 | 0,0000 | n/a | 0 |

Sarah (160/180 Hz) und Samuel (137/142 Hz) sind über beide Auftritte
konsistent; Matthew (186 Hz) und Kay (95 Hz) sind davon und voneinander
getrennt. Es gibt keinen Messhinweis auf eine Stimmvertauschung. Eine
abhörende Verifikation der Stimmidentität war technisch nicht möglich
(siehe Einschränkung oben).

**Endstille:** Dialog endet bei 11,653 s, Container läuft bis 15,083 s →
3,43 s Standbild bei exakt RMS 0,0000 (vollständig stumm). Optisch ruhig, aber
als Abschluss spürbar lang.


**Bewertung:** Die visuelle Prüfung ist **nicht bestanden**. Muster: T1 ohne
Animation, T3 ohne Animation, T4 auf dem falschen Gesicht (Slot 3 statt Slot 4).
Slot 4 wird im gesamten Clip nie animiert. Damit liegt eine Fehl-/Nicht-Zuordnung
zwischen Sync-Segment und Face-Slot vor, obwohl die Ledger-Kardinalität
(6/6 turn-backed Segmente) technisch korrekt war. Die sechs
`face_probe_unavailable`-Warnings aus dem forensischen Audit werden damit
rückwirkend als relevanter Kontext markiert (Bedingung aus Zeile b nicht
erfüllt).

Neutral dokumentiert, kein Fix, kein Retry, kein Render.

---

**FA-4 FINAL RETEST — TECHNICAL PASS / VISUAL REVIEW: ISSUES**

Technische Pipeline-Kriterien bestanden: Plate, Preclip, 6/6 turn-backed
Sync-Segmente, Audio-Mux, finaler Output und Ledger-Kardinalität korrekt.

Visuelle Abnahme nicht bestanden: T4 animiert den falschen Mund (Slot 3 statt
Slot 4), T1 und T3 zeigen keine Mundbewegung. Zusätzlich formal offen: die
abhörende Audioprüfung ist in der Sandbox technisch nicht möglich (Chromium
ohne H.264/AAC), es liegt nur eine signalanalytische Auswertung vor. FA-4
bleibt damit **nicht** auf PASS.

## FA-4 Root-Cause-Lock — Face-Candidate-Auswahl

**Scope:** read-only / deduktiv. Kein Code, kein Render, kein Retry, kein Reset,
keine DB-Mutation. Der übergeordnete FA-4-Status bleibt
**TECHNICAL PASS / VISUAL REVIEW: ISSUES**.

**Einschätzungsmethode:** `deduktiv geschlossen; kein Runtime-Log mehr
verfügbar`. Die relevanten `compose-dialog-segments`-Stdout-Logs aus dem
S11-Zeitfenster (2026-08-17 20:39Z–20:49Z) sind aus der Edge-Function-Log-
Retention gefallen (frühester verfügbarer Eintrag liegt bei 23:07Z). Die
folgende Kette wird deshalb aus dem aktuellen Code und den persistierten
Run-Daten von Szene `e658509d-cdeb-40f7-bd33-98e74144fdc5` / Run
`b9acfae3-8121-45ba-950a-9a1ad5373f5a` abgeleitet.

### 1) v278 lief deduktiv erfolgreich

`plateFaceSlotRouter.ts` baut eine globale bijektive Minimum-Distance-Zuordnung
über **alle** Detektionen, ohne Area-/Aspect-Plausibilitätsfilter. Für S11 mit
den Anchor-Centern

- Sarah `(0.243096, 0.222005)`
- Samuel `(0.386265, 0.196615)`
- Matthew `(0.601017, 0.203125)`
- Kay `(0.827762, 0.200521)`

und den 10 persistierten Face-Kandidaten ergibt die globale v278-Zuordnung
**vor** der Bridge:

| Character | Plate-Face | BBox | Distanz | matchConfidence | Befund |
|---|---|---|---|---|---|
| Sarah | slot 4 | `[226,244,286,327]` | ~0.18099 | ~0.638 | korrektes großes Face |
| Samuel | slot 7 | `[476,209,540,294]` | ~0.15395 | ~0.693 | korrekt |
| Matthew | slot 1 | `[819,113,831,128]` | ~0.05449 | ~0.890 | **False Positive** (12×15 px) |
| Kay | slot 2 | `[923,98,940,119]` | ~0.11360 | ~0.773 | **False Positive** (17×21 px) |

Die Confidence-Werte stimmen mit den persistierten Werten überein und folgen der
v278-Formel `1 - distance / 0.5`. Damit ist v278 deduktiv belegt, obwohl das
Runtime-Stdout verfallen ist.

**Wichtige Korrektur einer früheren Inferenz:** 10 persistierte Faces schließen
einen erfolgreichen v278-Lauf **nicht** aus. `routePlateFacesToAnchor()` gibt
alle erkannten Faces zurück, auch Extra-Faces; `ok` bleibt true, solange
`resolved >= anchor rows` und nicht `cols < rows`.

### 2) Ursache innerhalb v278: kein Plausibilitätsfilter vor Hungarian

Die winzigen False Positives für Matthew/Kay liegen geometrisch näher an den
Anchor-Centern als die realen großen Faces. Daher gewinnt die mathematisch
korrekte Hungarian-Minimierung auf einem falschen Kandidatensatz. v278 war also
nicht „korrekt und später komplett überschrieben“; es war für Matthew/Kay
bereits falsch.

### 3) `v183_anchor_identity_slot_bridge` ist ebenfalls deduktiv belegt

Nach v278 sind unter den ersten vier `faces` nach `slot`:

- slot 0: unlabeled
- slot 1: Matthew (False Positive)
- slot 2: Kay (False Positive)
- slot 3: unlabeled

Die Bridge iteriert `platesByVisual` nach `f.slot` und schreibt nur unlabeled
Faces mit `anchorByVisual[visualIdx]`, `matchConfidence = 0.85`. Daher:

- slot 0 `[1125,7,1142,30]` bekommt Sarah + `matchConfidence 0.85`
- slot 3 `[52,272,65,303]` bekommt Kay + `matchConfidence 0.85`

Das entspricht exakt dem persistierten Zustand. Die Bridge-Annahme „beide
Detektoren sortieren L→R“ ist hier falsch: v278 `slot` stammt aus der
Rekognition-Sortierung (row-major-artig über `cy`/`x`), nicht aus reiner
visueller L→R-Slotordnung. Die Bridge verschlechtert dadurch Sarah und erzeugt
einen zweiten Kay-Labelkandidaten.

### 4) v277 First-Match wird danach autoritativ

`anchorRekFacesByCid` nimmt pro gelocktem Character den **ersten** Face-Eintrag
in `plateIdentityMap.faces` (`!map.has(faceCid)`). Nach der Bridge ist die
Reihenfolge relevant:

- **Sarah:** slot 0 (False Positive) zuerst, korrektes Sarah slot 4 später →
  False Positive gewinnt.
- **Matthew:** slot 1 (False Positive) gewinnt; reales großes Face slot 8 ist
  unlabeled.
- **Kay:** slot 2 (False Positive) gewinnt; slot 3 (duplizierter False
  Positive) kommt später; reales großes Face slot 9 ist unlabeled.
- **Samuel:** slot 7 (korrekt) gewinnt.

Damit entstehen exakt die persistierten `speakerPlateBboxes`:

| Character | `speakerPlateBbox` |
|---|---|
| Sarah | `[1125,7,1142,30]` |
| Samuel | `[476,209,540,294]` |
| Matthew | `[819,113,831,128]` |
| Kay | `[923,98,940,119]` |

Frage 4 ist damit für **alle vier** Speaker deduktiv geschlossen, nicht nur
für Sarah.

### 5) `v239_repair_gate`: Confidence überspringt objektive Sanity

Plate-Auflösung: 1284×718. Produktions-Sanity verlangt Area 0.003–0.25 und
Aspect 0.4–2.5. Die tatsächlich verwendeten Boxen:

| Character | BBox | Area % | Aspect | Sanity | Trust-Grund |
|---|---|---|---|---|---|
| Sarah | `[1125,7,1142,30]` | 0.0424 % | 0.739 | `area_too_small` | `matchConfidence 0.85` |
| Samuel | `[476,209,540,294]` | 0.5901 % | 0.753 | sane | `matchConfidence ~0.693` |
| Matthew | `[819,113,831,128]` | 0.0195 % | 0.800 | `area_too_small` | `confidence ~0.890` |
| Kay | `[923,98,940,119]` | 0.0387 % | 0.810 | `area_too_small` | `confidence ~0.773` |

Im Code führt `trustedSlots.includes(i)` direkt zu
`goodSlots.push(i); return;` — `bboxSanity()` wird für trusted Slots **nicht**
ausgeführt. Deshalb repariert `v185` die drei untergroßen Boxen nie.

### 6) Geometrie-Gegenprobe nach existierendem Sanity-Filter

Werden die 10 Kandidaten zuerst mit den **bereits existierenden**
Produktionskriterien gefiltert, bleiben exakt diese vier großen Faces:

- slot 4 `[226,244,286,327]`
- slot 7 `[476,209,540,294]`
- slot 8 `[753,187,819,277]`
- slot 9 `[1030,208,1099,296]`

Vollständige 4×4-Distanzmatrix (Zeilen: Anchor-Slots Sarah/Samuel/Matthew/Kay;
Spalten: Face-Slots 4/7/8/9):

```text
         slot 4   slot 7   slot 8   slot 9
Sarah    0.18099  0.19931  0.38265  0.59998
Samuel   0.27447  0.15395  0.25890  0.46892
Matthew  0.44626  0.25266  0.12051  0.27177
Kay      0.65857  0.45734  0.24803  0.15046
```

Das global minimale bijektive Optimum ist die **Diagonale**:

- Sarah → slot 4
- Samuel → slot 7
- Matthew → slot 8
- Kay → slot 9

Damit war die korrekte Geometrie vollständig im Run vorhanden; der Fehler liegt
im fehlenden Kandidatenfilter, der Bridge und dem Trust-Gate — nicht in einem
Informationsmangel.

### 7) Preclip-Folge und letztes Gate

Die falschen BBoxes erzeugen falsche Crops, z. B.:

- Sarah: `x = 1024…1244, y = 0…220` (ihr Slot liegt links)
- Kay: `x = 734…1128, y = 0…394` (überlappt Matthews Zone)

Die persistierte Dispatch-Timeline enthält 6×
`FACE_GATE_PROBE_UNAVAILABLE`, jeweils unmittelbar gefolgt von `DISPATCHED`.
Der letzte Gate war also non-blocking / fail-open und konnte die falsche
Geometrie nicht mehr stoppen.

---

### Beantwortung der vier Lock-Fragen

| Frage | Ergebnis |
|---|---|
| Q1: Lief `v278`/Hungarian? | **JA** — deduktiv bewiesen, Runtime-Log verfallen. v278 war für Matthew/Kay selbst schon falsch, weil der Kandidatensatz ungefiltert war; nicht erst später überschrieben. |
| Q2: Lief `v183_anchor_identity_slot_bridge`? | **JA** — deduktiv bewiesen anhand exakt reproduzierbarer `matchConfidence 0.85`-Labels auf slot 0/slot 3. |
| Q3: Hat `v239` die falschen Boxen als trusted durchgelassen? | **JA** — bewiesen; Sanity wurde durch den trusted-Shortcut übersprungen. |
| Q4: Machte `v277` First-Match die falschen Kandidaten autoritativ? | **JA** — deduktiv für Sarah/Matthew/Kay/Samuel geschlossen; ergibt exakt die finalen `speakerPlateBboxes`. |

### Root Cause als Kette

```text
Anchor layout korrekt
  → v278 Hungarian auf ungefilterten 10-Face-Kandidaten
    → Matthew/Kay False Positives gewinnen
    → v183 slot-index Bridge labelt zusätzlichen False Positive als Sarah
      → v277 first-match bevorzugt falsche Labels
        → v239 Confidence-Trust überspringt Sanity
          → falsche Preclip-Crops
            → Face-Probe unavailable / fail-open
              → Sync.so verarbeitet falsche Geometrie erfolgreich
```

### Lock-Abschluss

- **FA-4 ROOT-CAUSE LOCKED — Face-Candidate-Auswahl**
- Ranking-only ausreichend: **NEIN**
- Geometrie-first mit Plausibilitätsfilter: **JA**
- Fix-Contract **implementiert** (siehe Abschnitt unten):

```text
Anchor Character Lock
  → plausible Plate-Face candidates
    → global bijective geometry assignment
      → identity labels only as supporting score
        → sanity always enforced
          → deterministic crop containment gate
            → Sync.so
```

Nicht mehr gültig: `Character label → first matching PlateFace → trust by
confidence → dispatch`.

**Unberührt bleiben:** Ledger, Fan-out, Turn-ID, `speaker_idx`, RS3, Mux,
Finalizer.

---

## FA-4 FACE-CANDIDATE FIX — IMPLEMENTATION (Code komplett, kein Deploy/Render)

Scope strikt nach eingefrorenem Contract; kein Architektur-Umbau.

### Neue reine Module (unit-getestet)

| Datei | Contract | Inhalt |
| --- | --- | --- |
| `supabase/functions/_shared/plate-face-candidates.ts` | A + B | `plateFaceSanity` (area_ratio 0.003–0.25, aspect 0.4–2.5), `filterPlausibleCandidates`, `assignAnchorsToCandidatesBijective` (Hungarian-Brute-Force N ≤ 6, fail-closed bei exakter Equal-Cost-Ambiguität und degenerierten Centern) |
| `supabase/functions/_shared/preclip-crop-containment.ts` | E | `evaluatePreclipCropContainment`: E.1 Target-Containment, E.3 Fremd-Center-Exklusion (Center im transformierten Target-Box ⇒ fail), E.4 Bounds-/Degeneriertheits-Check, E.5 Wire-Box = transformierte Target-Box |

Tests: `plate-face-candidates.test.ts` (inkl. S11-Regressionsfixture) und
`preclip-crop-containment.test.ts` — 15/15 PASS via `deno test`.

### Integration

1. **`_shared/plateFaceSlotRouter.ts`** — Sanity-Filter läuft **vor** dem
   Matrixaufbau; lokale `optimalAssignmentMin` entfernt und durch Contract B
   ersetzt. Ergebnis-Quelle bleibt `v278_hungarian_plate_router`.
2. **`compose-dialog-segments/index.ts`**
   - Neues Flag `fa4GeometryAuthoritative`
     (`assignmentLockSource === "v278_hungarian_plate_router"`).
   - v183-Bridge, `byIdRanked`-Ranking, Unlabeled-L→R-Fallback und der
     v277-Anchor-Lock sind für den autoritativen Pfad **neutralisiert**;
     Auswahl erfolgt ausschließlich über `fa4-geometry-bijection`.
     Unauflösbarer Slot bleibt leer (fail-closed, Log
     `fa4_geometry_slot_unresolved`).
   - **Contract D:** v239-Trust-Shortcut entfernt — `bboxSanity` läuft jetzt
     für **jeden** Slot nach der Zuordnung; Trust ist nur noch Diagnostik
     (Reason-Suffix `_despite_trust`).
   - **Contract E:** vor dem Setzen von `bounding_boxes_url` prüft
     `evaluatePreclipCropContainment` die Crop-Zuordnung. Bei Verstoß
     Hard-Fail `preclip_identity_geometry_mismatch` (lokalisiert, mit
     Credit-Refund über den bestehenden `_v152HardFail`-Pfad), sonst wird die
     transformierte Box als Wire-Box verwendet (Log-Suffix
     `fa4_containment=ok`).

### Identity-Labels

Rein diagnostisch. Sie fließen **nicht** in die Kostenmatrix ein, beeinflussen
weder Kosten noch Gewinner-Bijektion und dienen ausschließlich Telemetrie und
Fehlersuche. Kostenbasis ist ausschließlich die euklidische Distanz
normalisierter Zentren.

### Status

- Typcheck der neuen Module: sauber. `compose-dialog-segments` zeigt nur die
  bereits vorher bestehenden Strict-Null/`speaker_name`-Meldungen; keine neuen.
- **Kein Deploy, kein Render.** Deploy-Scope wäre ausschließlich
  `compose-dialog-segments`.

---

## FA-4 Face-Candidate — P0 Integration Correction (2026-08-17)

Vier enge Korrekturen an der bereits akzeptierten Grundimplementation. Kein
Deploy, kein Render, kein Retry/Reset.

### 1. Contract-B ist integration-level fail-closed

Ein **contractual** Geometrie-Fehlschlag des v278/FA-4-Routers darf nicht mehr
in den Legacy-Pfad `resolvePlateFaceIdentities()` fallen. Neu klassifiziert
`classifyRouterFailure({ reason, detectSucceeded, detectedCount, expectedCount, threw })`
in `_shared/plate-face-candidates.ts`:

- **contractual** (fail-closed, kein Legacy, kein Provider-Dispatch):
  `count_mismatch`, `incomplete_bijection`, `equal_cost_ambiguity`,
  `degenerate_candidate_centers` sowie `no_faces_detected`, wenn die Detection
  nachweislich erfolgreich lief, Anchor-Slots existieren und 0 Kandidaten kamen.
- **infrastructure** (Legacy-Recovery unverändert): `aws_credentials_missing`,
  `plate_fetch_failed`, `detect_failed:*`, `empty_input` und jede geworfene
  Router-Exception.

Der Router liefert die Klasse als Feld `failureClass` mit (plus
`detectSucceeded` / `detectedCount`); `compose-dialog-segments` klassifiziert
nicht neu. Bei contractual failure: Abbruch über `failLipSync` mit
Credit-Refund und HTTP 422 `plate_identity_geometry_fail_closed` (lokalisierte
Meldung DE/EN/ES), Log `fa4_contract_b_fail_closed`. Ledger/Fan-out und
Webhook-Pfade sind unverändert.

### 2. `input_too_large` entfernt

`MAX_ROWS`/`MAX_COLS` und die Fail-Reason `input_too_large` sind ersatzlos
entfernt — sie waren nicht Teil des eingefrorenen Contracts. Der Solver bleibt
exakt und verarbeitet den produktiven Max-Cast ohne neue fachliche Grenze:
Vorsortierung der Kandidaten je Anchor nach Distanz plus admissible
Best-Bound-Pruning (Suffix-Summe der Zeilenminima). Nur strikt schlechtere
Zweige werden abgeschnitten, damit die exakte Tie-Erkennung
(`equal_cost_ambiguity`) unverändert bleibt. Kein Epsilon, keine neue Schwelle.

### 3. Echte S11 Regression Fixture

`_shared/plate-face-candidates.test.ts` nutzt den exakt persistierten
S11-Datensatz: Plate 1284×718, 10 Kandidatenboxen in persistierter Reihenfolge,
vier **hart hinterlegte** Anchor-Center (nicht aus den Plate-Faces abgeleitet).
Erwartete Bijektion: Sarah `[226,244,286,327]`, Samuel `[476,209,540,294]`,
Matthew `[753,187,819,277]`, Kay `[1030,208,1099,296]`. Ein zweiter Test fährt
denselben Datensatz in umsortierter Detector-Reihenfolge und erwartet ein
identisches Ergebnis.

### 4. Ein kanonischer Sanity-Owner

`plateFaceSanity()` ist die einzige Quelle für area `0.003..0.25`, aspect
`0.4..2.5`, `degenerate` und `out_of_plate` (5 % In-Plate-Toleranz). Das lokale
`bboxSanity()` in `compose-dialog-segments/index.ts` ist nur noch ein dünner
Wrapper, der die bestehende Reason-Formatierung (inkl. `_despite_trust`)
beibehält. Schwellen und Toleranz sind semantisch unverändert.

### Verification

`deno test _shared/plate-face-candidates.test.ts _shared/preclip-crop-containment.test.ts`
→ **21 passed / 0 failed**, inklusive: exakte S11-Fixture, umsortierte
S11-Fixture, großer Cast ohne Size-Gate, contractual-Klassifikation aller vier
Geometrie-Reasons, Infrastructure-Klassifikation inkl. `threw`, sowie die
`no_faces_detected`-Differenzierung. `deno check compose-dialog-segments` zeigt
keine neuen Fehler in den geänderten Bereichen.

`FA-4 FACE-CANDIDATE IMPLEMENTATION CORRECTION READY → STOP`




