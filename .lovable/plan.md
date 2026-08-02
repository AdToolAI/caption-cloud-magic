## Wo wir stehen

Verifiziert im Code (v377–v380):
- Start eines Renders geht nur noch über `composer-start-scene-generation` (Run-Erwerb + Teardown + Dispatch als eine Server-Operation).
- `compose-dialog-segments` blockt Lip-Sync bei `master_clip_failed` / `no_active_scene_run`.
- Webhooks (`sync-so-webhook`, `remotion-webhook`) verwerfen Callbacks fremder Generationen.
- `scene-hard-reset.ts` enthält `stripDerivedSceneAssets` und `supersedeOpenRenders`.
- `auto-director-compose` erwirbt einen Run und übergibt `run_context`.

Nicht verifiziert: dass ein **echter** Regenerate-Lauf danach nachweislich keine Artefakte der Vorgeneration mehr berührt. Bisher liegt nur der synthetische Selbsttest vor. Deshalb keine Garantie, sondern dieser Plan.

## Plan v381

### 1. Realer Beweislauf (Kern)
Eine bestehende Szene mit Vorgeneration nehmen, „Clip generieren" auslösen und lückenlos protokollieren:
- Generation vorher/nachher, `active_run_id` vorher/nachher.
- Alle in diesem Lauf verwendeten Storage-Pfade auf Zugehörigkeit zur neuen Generation prüfen (Plate, Anchor, Preclips, Frames).
- Alle `plate_attempts`, `video_renders`, `dialog_dispatch_locks`, `syncso_inflight_jobs` der Szene: Zeilen älterer Generation müssen tombstoned/superseded sein.
- Ergebnis als Tabelle „Feld → alt → neu → Verdikt".

### 2. Restlücken, die der Lauf typischerweise aufdeckt
- **Reuse-Fenster:** `pass-face-preclip` liest `video_renders` — Lookup muss zwingend auf `plate_generation` + `active_run_id` filtern, nicht nur auf Szene. Prüfen und ggf. nachziehen.
- **Selbsttest-Assertion `no_active_run_after_reset`** ist falsch formuliert (v377 erwirbt den Run vor dem Reset). Umstellen auf „Run-ID ist neu und Generation ist gestiegen".
- **Autopilot-Pfad** einmal real durchlaufen lassen, da er erst jetzt Run-Kontext übergibt.

### 3. Dauerhafter Wächter
Log-Marker `v381_generation_provenance` an jedem Punkt, der ein Asset in die Pipeline hineinreicht (Plate-Load, Preclip-Cut, Sync-Dispatch, Mux): loggt die Generation der Quelle. Weicht sie von der aktiven Generation ab → harter Abbruch statt stiller Weiterverarbeitung. Damit ist die Klasse „alter Feed steckt noch drin" nicht mehr nur verhindert, sondern messbar.

## Technische Details
Betroffen: `supabase/functions/_shared/pass-face-preclip.ts` (Reuse-Filter), `supabase/functions/composer-reset-selftest/index.ts` (Assertion), `supabase/functions/compose-dialog-segments/index.ts` und `_shared/scene-hard-reset.ts` (Provenance-Marker). Kein Schema-Change nötig.
