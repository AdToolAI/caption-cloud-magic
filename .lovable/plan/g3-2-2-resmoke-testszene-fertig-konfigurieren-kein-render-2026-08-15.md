# G3.2.2 Resmoke — Testszene fertig konfigurieren (kein Render)

Ziel: Szene `be06d0fd-85ec-4822-a18b-ad32e7c82562` im Projekt `035273d7-…` über den normalen UI-Pfad dialogfähig machen, danach Snapshot + Routing-Nachweis. Kein Render, kein Dispatch.

Unangetastet: `b34d1eae…`, keine neue Szene, kein Cleanup des Nebenprojekts, keine direkten DB-Writes.

## Schritt 1 — Dialog über die UI persistieren

Per Playwright als `bestofproducts4u@gmail.com` in den Video Composer, Projekt öffnen, Szene S01 → Szenen-Dialog-Studio:

- genau eine Figur / ein Sprecher (Cast-Anzahl = 1)
- genau ein Dialog-Turn, kurze natürliche Zeile klar innerhalb des Plate-Budgets (Ziel ca. 4–6 s Sprechzeit)
- eine real auswählbare Voice-ID für diesen Sprecher, über den normalen Voice-Picker
- keine Tight-/Close-up-Sonderkonfiguration
- `engine_override = cinematic-sync` und `dialog_mode = true` unverändert lassen, außer die UI erzwingt eine Änderung
- Speichern über den normalen Speichern-/Übernehmen-Button

Nach dem Speichern sofort stoppen. Falls das Speichern selbst automatisch TTS/Plate/Lip-Sync/Provider-Dispatch auslöst: nichts weiter anfassen, den automatisch gestarteten Vorgang exakt dokumentieren (Zeitstempel, Function, Ledger-Zeilen) und STOP.

## Schritt 2 — Read-only Snapshot

Nur lesende Queries (`read_query`) für:

- `active_run_id`, `plate_generation`, `plate_ready_generation`, `pipeline_state`, `pipeline_substate`, `lip_sync_status`
- `engine_override`, `dialog_mode`, `audio_source`
- `dialog_script`, vollständige canonical/effective `dialog_turns` inkl. Speaker-ID / `speaker_idx`
- persistierte Voice-ID / `dialog_voices`, Cast-Anzahl
- `composer_pipeline_jobs` total sowie Attempts je Stage (`sync_segment`, `audio_mux`)
- `audio_plan.twoshot.rs3_reset`
- alle Pass-/`pipeline_job_id`-Pointer auf der Szene

Erwartung: `active_run_id = NULL`, `pipeline_state = idle`, Ledger = 0, sync_segment = 0, audio_mux = 0, kein RS3-Reset-Marker, keine alten Pointer.

## Schritt 3 — Routing-Nachweis aus den echten Regeln

Nachweis anhand der persistierten Werte gegen die aktuelle Routing-/Preflight-Logik, nicht gegen UI-Labels. Ausgewertet werden:

- `src/lib/video-composer/lipSyncIntent.ts` (`isLipSyncIntentional`) und `supabase/functions/_shared/lipSyncIntent.ts`
- `src/lib/video-composer/sceneEngineRouter.ts` und `src/lib/composer/__tests__/forceCinematicSyncRouting.test.ts`
- `supabase/functions/compose-video-clips/index.ts` (Branch-Auswahl Plate → Dialog-Segmente vs. Talking-Head vs. Tight-/Direct-Finalize)
- `compose-dialog-segments` Preflight-Guards (Dialog vorhanden, Voice vorhanden, Segmentanzahl, Plate-Budget)
- `resolveEffectiveDialog.ts` als SSoT für die effektive Dialoglänge

Zu belegen: single speaker + non-tight + intentional Lip-Sync + canonical turn + Voice ⇒ `compose-dialog-segments` → `sync_segment` → `audio_mux` → Stitch.

Explizit auszuschließen und je Punkt mit Codestelle zu begründen:

- Talking-Head-Pfad (`generate-talking-head`)
- Tight-/Direct-Finalize-Pfad
- Guard-Abbruch wegen fehlendem Dialog/Voice
- alternativer Provider-/Engine-Pfad, der `sync_segment` umgeht (inkl. Seedance-2.5-/Hailuo-Provider-Wahl gemäß v425-Contract)

Zusätzlich prüfen, dass die Dauer des Turns die `dialog_too_long_for_plate`-Schwelle nicht reißt.

## Abschluss

Nur wenn Snapshot und Routing-Nachweis vollständig grün sind: Meldung **G3.2.2 RESMOKE — TEST SCENE READY** mit finalem Snapshot, danach STOP. Der eigentliche UI-Renderstart ist ein separater nächster Schritt.

## Technische Hinweise

- Alle Schreibvorgänge ausschließlich über Playwright-UI-Interaktion (`/tmp/browser/g322-resmoke/`), Session-Restore per `lovable auth-session`.
- Alle DB-Zugriffe read-only.
- Kein Redeploy, keine Migration, keine Codeänderung in diesem Schritt.
