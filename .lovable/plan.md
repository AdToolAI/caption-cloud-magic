# FA-4 SETUP — 4 deutsche Sprecher, 6 Turns (kein Render)

Ziel: eine frische, unbelastete Szene für den 4-Sprecher-Lip-Sync anlegen und den Pre-Start-Zustand vollständig belegen. **Kein kostenpflichtiger Render** in diesem Schritt. FA-1/FA-2/FA-3 bleiben PASS und werden nicht erneut gefahren.

## Szene

Projekt `035273d7-ae9b-44e0-89e7-f9e28703530d`, neue Szene mit `order_index = 7`.
Nicht wiederverwendet: `5b0dca87…` (FA-3 Retest), `d9706a6e…` (FA-3), `8155c6d8…` (FA-2), `22cc0e10…` (FA-1) und alle sonstigen Evidence-Szenen.

Setup:

- `scene_type='custom'`, `clip_quality='standard'`, non-tight (keine Close-up-Sonderroute)
- `dialog_mode=true`, `lip_sync_with_voiceover=true` (intentionaler Lip-Sync, DB-persistiert)
- `engine_override='cinematic-sync'`, `clip_source='ai-happyhorse'` — zertifizierter Provider laut frozen Capability Matrix (`lipsyncMasterProvider.ts`: HappyHorse/Hailuo), `multiSpeaker=true`, Dauerraster 3–15 s
- `duration_seconds=15` (oberes HappyHorse-Raster) — Dialog wird so bemessen, dass die geschätzte Sprechzeit klar unter Plate-Budget bleibt (Ziel ≤ 12 s; der Server bricht sonst mit `dialog_too_long_for_plate` ab bzw. verlängert)
- `reference_image_url` wird — wie in FA-3 belegt — im Lauf durch `compose-scene-anchor` als 4er-Gruppen-Plate erzeugt; Pre-Run `NULL` ist kein Blocker

## Cast: exakt 4 Identitäten

Vier bestehende Cast-&-World-Charaktere des Projektbesitzers (`8948d3d9…`), Portrait-Cap 4 wird damit exakt getroffen:

| Reihenfolge | Character | ID |
| --- | --- | --- |
| 1 | Sarah Dusatko | `5c81f9bf-a5f1-4608-849f-e2a4adc84bcb` |
| 2 | Samuel Dusatko | `483f9cdc-eb31-4486-bf67-9c5e7d955016` |
| 3 | Matthew Dusatko | `54d90504-7253-482f-9c6f-1902e8a6749b` |
| 4 | Kay Mark | `c65de5c6-75e1-47aa-956c-cd0cc424e736` |

Vier **unterschiedliche deutsche** ElevenLabs-Voices, je Character genau eine, persistiert in `dialog_voices` (Key = characterId, kein Alias-Key-Doppelzählen) und eindeutig — keine Voice-ID doppelt.

## Dialogplan: 6 Turns, 4 Sprecher

Deutsches Skript in `dialog_script`, Reihenfolge eindeutig, mehr Turns als Sprecher, zwei Sprecher mehrfach:

```text
1 Sarah   2 Samuel   3 Matthew   4 Kay   5 Sarah   6 Samuel
```

Jeder Sprecher mindestens einmal; Sarah und Samuel je zweimal. Jede Zeile kurz (≈1,5–2 s), Summe im Budget.

`speaker_idx` wird **nicht** vorab erzwungen: wie die kanonischen Turns wird die Prägung erst im Lauf (`compose-twoshot-audio`) deterministisch geschrieben. Pre-Run belegen wir nur die eindeutige Character-/Turn-Reihenfolge; im Lauf muss die Prägung exakt `0..3` über 6 Turns ergeben.

## Pre-Start-Nachweis (read-only, muss alles leer sein)

- `active_run_id IS NULL`
- Ledger `composer_pipeline_jobs` für diese Szene = 0 Zeilen
- keine `sync_segment`-/`audio_mux`-Historie (Jobs, Audit, Transition-Log)
- kein RS3-Marker (`audio_plan.twoshot.rs3_reset` fehlt), kein `rs3_reset_id`
- keine Pass-/Job-Pointer in `dialog_shots` / `audio_plan`
- keine Outputs: `clip_url`, `processed_video_url`, `base_video_url`, `lip_sync_source_clip_url` NULL
- `pipeline_state='idle'`, `lip_sync_status` leer, `plate_generation` initial
- Cast genau 4 distinct `characterId` (via `countSceneSpeakers`-Semantik, ID-basiert)
- Dialogplan eindeutig 6 geplante Turns, Turn→Character-Zuordnung eindeutig
- jede Voice persistiert, 4 verschiedene Voice-IDs

## Routing-Nachweis (statisch, kein Dispatch)

`compose-twoshot-audio` → Plate (Gruppen-Anker, N≥3-Variante) → `compose-dialog-segments` → `sync_segment` **× 6 (Turn-Anzahl)** → `audio_mux` → Stitch → `composer_finalize_lipsync_scene` (setzt seit FA-3/P1 `processed_video_url` atomar).

Belegt wird über den Code: N-Slot-Face-Map (`slotIndex` 0..N-1, sortiert nach x), `expectedFaceCount=4`, Pass-Schleife ohne Cap, Portrait-Cap 4 in `compose-scene-anchor`.
Pre-Run gilt `resolveEffectiveDialog()` nicht als Beweis (bei `dialog_turns=[]` vertragsgemäß `reason='no_turns'`); Nachweis ist `parseScriptLines()` → 6 Zeilen → 4 eindeutige Sprecher → 4 persistierte Voices → Länge im Plate-Budget.

## UI/DB-Intent-Konsistenz (C1)

Browser-Smoke auf der Szene, Reload, Nachweis dass der Lip-Sync-Intent nach der Hydration dem DB-Wert entspricht (Tri-State aufgelöst, kein Draft-Override) und dass die 4 Sprecher im Dialog-Studio erscheinen.

## Kostenhinweis (nur Info, kein Start)

4 Sprecher × 6 Passes treiben die Sync-Kosten (`ceil(dur) × 9 × passes`). Der Kostenvoranschlag wird im Renderdialog abgelesen und im Bericht dokumentiert — bestätigt wird erst nach separatem GO.

## Report

`docs/v433-motion-studio-final-acceptance.md` ergänzen: Scene-ID, Cast-Tabelle, Voice-Map, Dialogplan, Pre-Start-Tabelle, Routing- und Intent-Nachweis.

Abschluss: **FA-4 SETUP READY → STOP.**
