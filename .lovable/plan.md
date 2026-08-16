# FA-3 RETEST SETUP — frische Szene, kein Render

Ziel: eine neue, unbelastete Szene exakt nach dem bereits akzeptierten FA-3-Setup anlegen und den Pre-Start-Zustand belegen. **Kein kostenpflichtiger Render** in diesem Schritt.

## Szene

Projekt `035273d7-ae9b-44e0-89e7-f9e28703530d`, neue Szene mit `order_index = 6`.
Nicht wiederverwendet: `d9706a6e…` (FA-3), `8155c6d8…` (FA-2), `22cc0e10…` (FA-1), S06 und alle sonstigen Evidence-Szenen.

Setup gespiegelt von der akzeptierten FA-3-Szene:

- `scene_type='custom'`, `duration_seconds=8`, `clip_quality='standard'`
- Single-Speaker, non-tight: genau **eine** Skriptzeile, genau **ein** effektiver Sprecher
- `dialog_mode=true`, `lip_sync_with_voiceover=true` (intentionaler Lip-Sync, DB-persistiert)
- `engine_override='cinematic-sync'`
- eine persistierte Voice in `dialog_voices` (ElevenLabs, Character `5c81f9bf…`), `character_voice_id` gesetzt
- `reference_image_url` gesetzt (Anker-Invariante, Cast-Charakter)
- Provider laut frozen Capability Matrix (`lipsyncMasterProvider.ts`: HappyHorse/Hailuo) — kein Seedance-2.5-Plate
- `dialog_turns=[]` vor dem Run ist zulässig; maßgeblich sind Skriptzeile + persistierte Voice

## Pre-Start-Nachweis (read-only, muss alles leer sein)

- `active_run_id IS NULL`
- Ledger `composer_pipeline_jobs` für diese Szene = 0 Zeilen
- keine `sync_segment`-/`audio_mux`-Historie (Jobs, Audit, Transition-Log)
- keine Pass-/Job-Pointer in `dialog_shots` / `audio_plan`
- kein RS3-Marker (`audio_plan.twoshot.rs3_reset` fehlt)
- keine Output-Historie: `clip_url`, `processed_video_url`, `base_video_url` NULL
- `pipeline_state='idle'`, `lip_sync_status` leer, `plate_generation` initial

## Routing-Nachweis

Kette wird über den Code belegt (statisch, kein Dispatch):
`compose-twoshot-audio` → Plate → `compose-dialog-segments` → `sync_segment` → `audio_mux` → Stitch.
Der v430-Effektivdialog (`resolveEffectiveDialog`) muss die eine Skriptzeile als effektive Sprecherzeit liefern (kein `dialog_too_long_for_plate`).

## UI/DB-Intent-Konsistenz

Nach dem Anlegen: Browser-Smoke auf der Szene, Reload, und Nachweis, dass der Lip-Sync-Intent nach der Hydration dem DB-Wert entspricht (C1-Reconciliation, Tri-State aufgelöst, kein Draft-Override).

## Report

`docs/v433-motion-studio-final-acceptance.md` ergänzen: Scene-ID, Setup-Felder, Pre-Start-Tabelle, Routing- und Intent-Nachweis.

Abschluss: **FA-3 RETEST SETUP READY → STOP.** Der kostenpflichtige Retest-Render wird erst nach separatem GO gestartet. FA-1 und FA-2 bleiben PASS.
