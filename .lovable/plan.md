# Motion Studio — strukturelle Finalisierung (v430)

Leitprinzip: Die funktionierende Lip-Sync-Engine wird **nicht** refaktoriert. Run-Identität (`active_run_id` + `plate_generation`), Geometriemessung auf `reference_image_url`, eingefrorener Assignment-Lock und das fail-closed Outcome-Gate bleiben unangetastet. Wir räumen das Motion Studio **um sie herum** auf.

Reihenfolge: Output-Semantik → Capabilities → Visual-Input → Continuity → UI. Der `dialog_too_long_for_plate`-Fehler wird bewusst **nicht** zuerst geflickt; er löst sich in Schritt 1/3 als Nebeneffekt der entkoppelten Dauerrechnung.

---

## Schritt 1 — Output-Semantik (kompatibel, kein Big Bang)

Heute überschreibt der Sync.so-Webhook `clip_url` in-place; die Priorität `lip_sync_source_clip_url ?? clip_url` ist an mindestens drei Stellen dupliziert.

- Neue Felder auf `composer_scenes`: `base_video_url`, `processed_video_url`. Backfill: `base_video_url = COALESCE(lip_sync_source_clip_url, clip_url)`, `processed_video_url = clip_url` wenn `lip_sync_status = 'applied'`.
- `clip_url` bleibt bestehen als **vom Resolver geschriebene Kompatibilitätsspalte**. Bridge-Trigger `composer_scene_state_bridge()`, Media-Library-Sync und Exporter laufen unverändert.
- Ein einziger Resolver `resolveSceneOutput(scene)` (Client + Backend-Spiegel) ersetzt alle duplizierten `?? `-Ketten in `useTwoShotAutoTrigger.ts`, `DebugLipsync.tsx` und `compose-dialog-segments`.
- `lip_sync_source_clip_url` wird zur reinen Legacy-Spiegelspalte (weiter geschrieben, nicht mehr gelesen).

## Schritt 2 — Capability-System zentralisieren

Capabilities liegen heute in vier Quellen: `aiVideoModelRegistry.ts`, `providerCapabilities.ts`, `modelProfiles.ts`, `lipsyncMasterProvider.ts` — plus hartkodierte Checks (`isHailuoScene`, 6s/10s-Buckets).

- Eine Matrix `src/lib/composer/providerMatrix.ts` als alleinige Wahrheit: pro Provider `i2v`, `t2v`, `videoReference`, `inputSlots`, `durationRange`/`durationBuckets`, `nativeAudio`, `lipsyncMaster`.
- Kein zweites `pipelineMode`-Feld: Lip-Sync bleibt eine Capability (`lipsyncMaster`), der bestehende fail-closed Guard in `compose-video-clips` (`provider_not_lipsync_certified`) bleibt exakt so.
- Backend-Spiegel `_shared/provider-matrix.ts` wird aus derselben Definition generiert; ein Vertragstest vergleicht beide Seiten und failt bei Drift.
- Hartkodierte Dauer-Buckets werden durch Matrix-Lookups ersetzt.

## Schritt 3 — Visual Input statt „Frame-First"-Modus

Kein Backendpfad kennt den Begriff „Frame-First" — er ist reiner localStorage-UI-Toggle.

- Neues persistiertes Feld `generation_input.visual_source`: `manual | character_anchor | previous_final_frame | uploaded_reference | generated_still`.
- `slotArbitration.ts` entscheidet nicht mehr implizit aus dem Zustand, sondern validiert die explizite Quelle gegen die Provider-Slots aus Schritt 2. Ergebnis bleibt derselbe `TransitionMode` (`frame-chain`, `clip-reference`, `endframe-bridge`, `match-cut`).
- Unverändert: Bei Lip-Sync gewinnt der Anker kategorisch, Continuity ist hart gesperrt (drei Schichten, v428).
- Der Frame-First-Button wird zur Anzeige der aktiven `visual_source`, nicht zu einem eigenen Modus.
- Begriffstrennung: UI-`transitionType` (Cut/Crossfade, reines Compositing) wird in `cutStyle` umbenannt, damit es nicht mehr mit dem Resolver-`TransitionMode` kollidiert.

## Schritt 4 — Continuity-Abhängigkeitsmodell (Variante C)

- Szene 2 übernimmt den neuen Frame von Szene 1 **automatisch, solange sie selbst noch nie gerendert wurde**.
- Wurde Szene 2 bereits gerendert, bleibt ihr Ergebnis stehen und sie wird als `continuity_stale` markiert (mit `continuity_source_scene_id` + `continuity_source_clip_url`, gegen den der Frame gecacht wurde). Die Karte zeigt „Anschluss veraltet" plus Button „Continuity aktualisieren".
- `beginSceneRun()` nullt weiterhin die eigenen Frames, setzt aber zusätzlich `continuity_stale` auf allen direkten Nachfolgern — keine transitive Kaskade, die Kette propagiert erst beim jeweiligen Re-Render.
- Geparkte Einträge in `composer_continuity_queue` bekommen einen eigenen Status statt `clip_status = 'generating'`, damit Polling-Hooks sie nicht als laufenden Provider-Job missdeuten.

## Schritt 5 — State Machine als einziger Orchestrierungsvertrag

- `composer_scenes.pipeline_state` + die atomaren DB-Transitions bleiben die Wahrheit. **Keine neue Frontend-State-Maschine.**
- Legacy-Spiegel (`clip_status`, `twoshot_stage`, `lip_sync_status`) werden schrittweise read-only: erst alle Client-Leser auf `pipeline_state` umstellen, dann die Rückwärtsrichtung des Bridge-Triggers (Legacy → State) abschalten, Vorwärtsrichtung (State → Legacy) für Kompatibilität behalten.
- Der Watchdog für verwaiste Jobs und `composer_pipeline_jobs` mit `claimPipelineCallback` bleiben unverändert.

## Schritt 6 — UI-Aufräumen (zuletzt)

- SceneCard zeigt Zustand ausschließlich aus `pipeline_state` + Resolver-Output.
- Die drei Reset-Aktionen werden zu zwei klaren: „Lip-Sync neu" (Plate behalten) und „Alles neu" (Run-Reset).
- Debug-Panels lesen über den Resolver statt über eigene Feldketten.

---

## Technische Details

**Nicht anfassen:** `compose-dialog-segments` Pass-Aufbau (v95 Per-Turn-Split, v194 Stabilizer), Geometrie-/Assignment-Kette, Sync.so-Dispatch, `try_claim_mux_dispatch`, `safeMarkSceneFailed`, `beginSceneRun`-Kern.

**Vertragstests je Schritt:** Provider-Matrix-Spiegel (Client vs. Backend), Resolver-Output vs. Legacy-Kette auf Bestandsdaten, Lip-Sync-Anker-Kohärenz (bestehende 118 Tests müssen grün bleiben), Continuity-Staleness-Propagation.

**Migrationen:** additiv, jede mit GRANTs; keine Spalte wird in dieser Phase gelöscht. `clip_url`-Drop ist explizit **kein** Teil dieses Plans.

**Sprecher-Kardinalität (Dokumentationskorrektur):** Der Vertrag lautet „ein Sync.so-Pass pro Dialog-Turn plus ein Stabilizer-Pass pro Zuhörer" — nicht „ein Job pro Sprecher". `speaker_idx` ist Identitäts-/Geometrie-Key, nicht Job-Kardinalität. Wird in `docs/lipsync-pipeline-v400-errata.md` nachgezogen.
