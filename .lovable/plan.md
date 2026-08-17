# FA-4 FINAL RETEST SETUP — S11 Voice-/Turn-Bindung abschließen (kein Render)

Ziel: S11 (`e658509d-cdeb-40f7-bd33-98e74144fdc5`) über den normalen Studio-Pfad
fertigstellen — 4 Voices gebunden, 6 kanonische Turns persistiert — dann read-only
Snapshot und STOP. Kein Render, keine manuellen DB-Writes.

Unangetastet: S10 (`585da82a…`) und S08 (`42bcdda1…`) bleiben Evidence.

## Schritt 1 — Skript-Studio über den normalen UI-Pfad öffnen

Playwright gegen die laufende App, Szene S11 im Motion Studio öffnen, Tab/Panel
„Skript schreiben“ bzw. Skript-Studio aufklappen. Nur echte UI-Interaktionen
(Rollen-/Label-basierte Selektoren), keine `page.evaluate`-Zustandsmanipulation.

## Schritt 2 — 4 Voices den 4 Character-IDs zuweisen

Sarah, Samuel, Matthew, Kay erhalten je eine unterschiedliche ElevenLabs-Voice-ID
über den Voice-Picker im Skript-Studio. Keine Doppelbelegung.

## Schritt 3 — Dialog speichern/persistieren

Speichern über den normalen Save-Pfad des Panels. Danach read-only prüfen:
`dialog_voices` enthält 4 distinct Voice-IDs, je über die Character-ID gebunden.

## Schritt 4 — Turn-Identität verifizieren (read-only)

Erwartung: 6 `dialog_turns` mit eindeutigen `turn_id`, auf exakt 4 distinct
Character-IDs.

| Turn | Character | Bedingung |
|---|---|---|
| 1 / 5 | Sarah | gleiche `character_id`, verschiedene `turn_id` |
| 2 / 6 | Samuel | gleiche `character_id`, verschiedene `turn_id` |
| 3 | Matthew | eigene `character_id` |
| 4 | Kay | eigene `character_id` |

## Schritt 5 — Reload und finaler Pre-Start-Snapshot (read-only)

- `active_run_id = NULL`, `pipeline_state = idle`, `lip_sync_status` leer
- `composer_pipeline_jobs` für S11 = 0 Zeilen (`sync_segment` = 0, `audio_mux` = 0)
- `clip_url`, `base_video_url`, `processed_video_url`, `reference_image_url` = NULL
- keine Pass-/Job-Pointer in `dialog_shots` / `audio_plan`
- kein RS3-Marker (`audio_plan.twoshot.rs3_reset`, `rs3_reset_id`)
- C1: Lip-Sync-Intent nach vollem Reload **resolved** und identisch mit dem
  persistierten DB-Wert (kein Draft-Overlay)
- `plate_generation`: Startwert nur dokumentieren, kein Zielwert
- Kostenvoranschlag nur ablesen

## Abbruchbedingungen (kein Workaround)

1. **Panel weiterhin nicht bedienbar** über den normalen UI-Pfad → STOP und als
   UI-/Setup-Blocker melden. Keine manuellen DB-Writes, keine Migration, kein
   direktes RPC-Setzen.
2. **`dialog_turns` bleibt leer trotz korrekt gespeichertem Skript + Voices** →
   ebenfalls STOP. Vorher read-only klären, ob die Turn-Materialisierung im
   aktuellen Produktvertrag JIT beim Render passiert (`_shared/scene-dialog-turns.ts`,
   `compose-twoshot-audio`) oder ob der neue `turn_id → segment_id`-Pfad eine
   bereits persistierte Turn-Liste voraussetzt. Ergebnis dokumentieren, nicht fixen.

## Dokumentation

Abschnitt „FA-4 FINAL RETEST SETUP (S11)“ in
`docs/v433-motion-studio-final-acceptance.md` ergänzen: Voice-Tabelle,
Turn-Identitätstabelle, Snapshot, Kostenvoranschlag — bzw. der Blocker-Befund.

## Abschluss

Bei Erfolg: **FA-4 FINAL RETEST SETUP READY → STOP.** Kein Render. Der finale
FA-4-Render startet erst nach separatem GO.
