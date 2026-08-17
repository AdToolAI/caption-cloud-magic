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

## Schritt 4 — Turn-Identität prüfen (read-only, zwei zulässige Ausgänge)

`dialog_turns` vor dem Render ist **keine** harte Pre-Start-Bedingung. Nach dem
Voice-Save read-only zählen:

**Fall A — 6 Rows vorhanden:** IDs direkt verifizieren.

| Turn | Character | Bedingung |
|---|---|---|
| 1 / 5 | Sarah | gleiche `character_id`, verschiedene `turn_id` |
| 2 / 6 | Samuel | gleiche `character_id`, verschiedene `turn_id` |
| 3 | Matthew | eigene `character_id` |
| 4 | Kay | eigene `character_id` |

**Fall B — 0 Rows:** kein P0/P1. Read-only belegen, dass der produktive Pfad die
Turns weiterhin JIT materialisiert (`ensureDialogTurnsForScene` bzw. Äquivalent in
`_shared/scene-dialog-turns.ts`) und zwar **vor** `compose-twoshot-audio` und damit
vor Erzeugung des `turn_id`-Payloads. Ist das bestätigt, ist S11 gültig mit:

- `dialog_turns_prestart = 0` (expected JIT)
- Skript eindeutig auf die 4 Character-IDs auflösbar
- 4 Voices korrekt ID-gebunden
- die sechs realen `turn_id` werden unmittelbar beim Renderstart gesichert


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
2. **JIT-Pfad nicht mehr vorhanden** oder `compose-twoshot-audio` erwartet
   `turn_id`, bevor Turns materialisiert sind → STOP als Setup-/Lifecycle-Blocker.
   Kein künstlicher Fix nur damit Pre-Render bereits Rows existieren.

## Dokumentation

Abschnitt „FA-4 FINAL RETEST SETUP (S11)“ in
`docs/v433-motion-studio-final-acceptance.md` ergänzen: Voice-Tabelle,
Turn-Status (Fall A/B), Snapshot, Kostenvoranschlag — bzw. der Blocker-Befund.

## Abschluss

Bei Erfolg: **FA-4 FINAL RETEST SETUP READY** — oder, falls Turns
erwartungsgemäß JIT bleiben: **FA-4 FINAL RETEST SETUP READY — dialog_turns JIT
VERIFIED**. Danach STOP. Kein Render; der finale FA-4-Render startet erst nach
separatem Render-GO.

