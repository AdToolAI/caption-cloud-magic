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
