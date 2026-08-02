## Ehrliche Antwort

Nein — zwei Klassen sind jetzt wirklich dicht, eine dritte ist es noch nicht.

**Dicht (serverseitig verifiziert):**
- Lip-Sync nach fehlgeschlagener Szene: `compose-dialog-segments` (Zeile ~846) blockt jeden Aufruf mit `master_clip_failed` / `no_active_scene_run` — egal ob Browser-Auto-Trigger, Webhook oder Watchdog. Die verbliebenen Direkt-Aufrufe (`ClipsTab:494`, `useTwoShotAutoTrigger:505`, `compose-clip-webhook:450`, `autopilotComposerBridge:337`) laufen alle in diesen Guard.
- Alte Callbacks: Generation-Bump vor jedem Teardown + tombstoned `plate_attempts` + generation-scoped Webhook-Writes (v376/v379).

**Noch nicht dicht — im Reset verifizierte Lücken:**
1. `hardResetScene` setzt `scene_assets` **nicht** zurück (kein Treffer im File). Dort hängen Plate-/Anchor-/Preclip-Referenzen der Vorgeneration.
2. Es werden **keine** `video_renders`- und `ai_jobs`-Zeilen der Szene invalidiert — nur `dialog_dispatch_locks` und `syncso_inflight_jobs`.
3. `auto-director-compose:246` ruft `compose-video-clips` **ohne** `run_context` auf → seit v378 wird das für persistierte Szenen abgelehnt (Autopilot-Regression).

## Plan v380

### 1. Reset vollständig machen
In `_shared/scene-hard-reset.ts`:
- `scene_assets` im finalen Update auf die vom Nutzer gepflegten Felder reduzieren (abgeleitete Plate-/Anchor-/Preclip-/Tracking-Keys entfernen) — analog zu `stripDerivedAudioPlan`, neue Helper-Funktion `stripDerivedSceneAssets`.
- `video_renders` und `ai_jobs` der Szene mit älterer Generation als `canceled`/`superseded` markieren (kein Delete, damit Forensik bleibt).

### 2. Autopilot-Pfad auf den Single-Run-Vertrag heben
`auto-director-compose` erwirbt vor dem Dispatch pro Szene einen Run (gleiche Logik wie `composer-start-scene-generation`) und übergibt `run_context`.

### 3. Beweis statt Behauptung
Selbsttest-Funktion `composer-reset-selftest`: legt Testszene mit Artefakten an, führt Reset aus, prüft dass alle abgeleiteten Felder/Zeilen leer bzw. superseded sind, und liefert ein Prüfprotokoll. Danach ein realer Lauf mit Log-Nachweis.

## Technische Details
- Betroffen: `supabase/functions/_shared/scene-hard-reset.ts`, `supabase/functions/auto-director-compose/index.ts`, neue Function `composer-reset-selftest`.
- Kein Schema-Change nötig; `plate_attempts`-Trigger bleibt unverändert.
