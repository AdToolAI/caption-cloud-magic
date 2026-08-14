# v431 G2.3 — Upload-Finalisierung & caller-spezifische Fail-Writes

**Status:** DONE / FROZEN  
**Scope:** exakt 3 Pfade, wie im verbindlichen Endvertrag festgelegt.

## Umgesetzte Änderungen

### 1. Datenbank — neues Domain-Primitive `composer_finalize_upload_scene`

Migration: `20260815000000_v431_g2_3_upload_finalizer.sql`

- Nur `write_id='cvc:upload-complete'` erlaubt.
- `SECURITY DEFINER`, `search_path = pg_catalog, public`.
- Row Lock auf `composer_scenes`.
- Run + Generation Pflicht; geprüft gegen `active_run_id` / `plate_generation`.
- From-Set streng `{idle, plate_queued}`.
- Keine neuen globalen Transition-Kanten; schreibt direkt `pipeline_state='complete'`.
- Legacy-Spiegel (`base_video_url`, `processed_video_url`, `clip_url`, `clip_status`) im selben UPDATE atomar mit dem kanonischen State.
- Jeder Versuch landet im `composer_scene_transition_log`.

### 2. Datenbank — Erweiterung `composer_fail_scene_with_mirrors`

Migration: `20260815000500_v431_g2_3_fail_mirrors_extension.sql` (Tool-Name intern)

- Neuer optionaler Parameter `_clear_lip_sync_fields boolean DEFAULT false`.
- Wenn `true`, werden im selben atomaren UPDATE zusätzlich zurückgesetzt:
  - `lip_sync_status = NULL`
  - `twoshot_stage = NULL`
  - `lip_sync_source_clip_url = NULL`
  - `dialog_shots = NULL`
- Bestehende Aufrufer verhalten sich unverändert.

### 3. `supabase/functions/compose-video-clips/index.ts`

#### Upload-Complete (`cvc:upload-complete`)
- Erwirbt Run-Stempel aus `sceneRunStamps`.
- Bei vorhandener Provenienz: Aufruf von `composer_finalize_upload_scene` per RPC.
- Bei fehlender Provenienz: Legacy-Pfad bleibt erhalten (Warn-Log).
- Falls der Finalizer `applied=false` zurückgibt, wird der Fehler geloggt und ein failed-Result zurückgegeben; es findet kein ungeguardeter Write statt.

#### Pika-Failure (`cvc:failed/pika`)
- Erwirbt Run-Stempel aus `sceneRunStamps`.
- Bei vorhandener Provenienz: Aufruf von `composer_fail_scene_with_mirrors` per RPC mit `_clip_status='failed'` und `_clear_lip_sync_fields=true` für cinematic-sync Szenen.
- Bei fehlender Provenienz: Legacy-Pfad mit `failedClipUpdate(...)` bleibt erhalten.

### 4. `supabase/functions/compose-twoshot-audio/index.ts`

#### ID-Only-Dialog-Turns-Failure (`cta:id_only_dialog_turns_required`)
- Verwendet `dispatchRunId` / `dispatchPlateGeneration` aus dem Request-Body (G2.1 Transport).
- Bei vorhandener Provenienz: Aufruf von `composer_fail_scene_with_mirrors` per RPC mit `_lip_sync_status='failed'`, `_twoshot_stage='failed'`.
- Bei fehlender Provenienz: Legacy-Pfad bleibt erhalten.

## Nicht im Scope (wie vereinbart)

- `compose-dialog-segments` und alle Advance/Retry/Deferred-Zweige bleiben Legacy.
- Keine Runless-Regeln, kein Grandfathering, keine G0-Core-Erweiterung.
- Keine weiteren globalen Transition-Kanten.

## Test- & Verifikationsergebnisse

- **Composer-Unit-Tests:** 373 Tests in `src/lib/composer/__tests__` — PASS.
- **Gesamt-Unit-Test-Lauf:** 706 PASS, 39 FAIL. Die 39 Failures sind ausschließlich in nicht-berührten Bereichen (z. B. `TemplatePerformanceDashboard.test.tsx` wegen Localization-Mismatch `/no data/i` vs. deutscher UI-Text). Kein Failure steht in Zusammenhang mit den G2.3-Änderungen.
- **Edge-Function Typecheck:** `deno check` zeigt 20 vorhandene Typfehler in `compose-video-clips/index.ts` (bereits vor G2.3 vorhanden: `identityFailure`-Vergleiche, `lockReferenceUrl` Property). Keiner der neuen G2.3-Zeilen erzeugt einen TypeScript-Fehler.
- **Datenbank-Migrationen:** Beide Migrationen erfolgreich via `supabase--migration` angewendet.

## STOP

G2.3 ist abgenommen und eingefroren. Nächster Schritt nach User-Freigabe: G2.4 oder Weiterführung nach Plan.
