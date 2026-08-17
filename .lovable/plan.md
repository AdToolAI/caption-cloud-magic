# FA-4 FINAL RETEST SETUP — frische Szene S11 (kein Render)

Ziel: eine jungfräuliche Szene S11 exakt nach dem abgenommenen FA-4-Aufbau anlegen, den
Pre-Start-Snapshot read-only belegen und stoppen. Kein kostenpflichtiger Render.

Unangetastet: S10 (`585da82a…`) und S08 (`42bcdda1…`) bleiben Evidence — kein Reset,
kein Retry, keine Löschung. Ebenso alle früheren FA-1/FA-2/FA-3-Szenen.

## Aufbau S11 (Projekt `035273d7-…`, nächster freier order_index)

| Merkmal | Wert |
|---|---|
| scene_type | custom |
| duration | 15 s (Plate) |
| Engine | cinematic-sync, Provider `ai-happyhorse` (frozen Capability Matrix v425) |
| Lip-Sync-Intent | intentional ON (`lip_sync_with_voiceover=true`, `dialog_mode=true`) |
| Tightness | non-tight |
| Cast | 4 distinct Characters (Sarah, Samuel, Matthew, Kay) |
| Voices | 4 distinct ElevenLabs-Voice-IDs, keine Doppelbelegung |
| Turns | 6 kanonisch; Turn 1 = Turn 5 (gleiche Character-ID), Turn 2 = Turn 6 (gleiche Character-ID) |
| Sprechzeit | Zielkorridor ~8–10 s, sicher unter der `dialog_too_long_for_plate`-Schwelle |

Dialog neu formuliert (keine Textidentität mit S08/S10, gleiche Struktur/Länge):

```text
1 Sarah Dusatko:   Die Wochenzahlen sind da.
2 Samuel Dusatko:  Klickrate zieht deutlich an.
3 Matthew Dusatko: Das neue Motiv performt am besten.
4 Kay Mark:        Dann skalieren wir es sofort.
5 Sarah Dusatko:   Einverstanden, wir bleiben dran.
6 Samuel Dusatko:  Auswertung folgt morgen früh.
```

Angelegt über den normalen Studio-/Persistenz-Pfad (Szene hinzufügen, Cast setzen,
Voices binden, Skript schreiben, Lip-Sync-Toggle ON, speichern). Keine manuellen
DB-Writes, keine Migration, kein RS3-Marker, keine Pointer, kein Dispatch.

## Pre-Start-Snapshot (read-only)

- `active_run_id = NULL`
- `pipeline_state = idle`, `lip_sync_status` leer
- `plate_generation`: kein Zielwert gefordert — nur der Startwert wird dokumentiert;
  entscheidend ist, dass kein aktiver Run/Job/Pointer existiert (der Render darf den
  Zähler danach kontrolliert erhöhen)
- `composer_pipeline_jobs` für die Szene = 0 Zeilen (insb. `sync_segment` = 0, `audio_mux` = 0)
- keine Output-Historie: `clip_url`, `base_video_url`, `processed_video_url` alle NULL
- `reference_image_url = NULL`
- keine Pass-/Job-Pointer in `dialog_shots` / `audio_plan`
- kein RS3-Marker (`audio_plan.twoshot.rs3_reset`, `rs3_reset_id` fehlen)
- genau 6 `dialog_turns` auf exakt 4 distinct Character-IDs; Turn 1 = Turn 5 und
  Turn 2 = Turn 6 mit identischer Character-ID; jede Turn-ID eindeutig
- 4 distinct Voice-IDs, je über die Character-ID gebunden, keine Doppelbelegung

- C1: nach vollem Reload ist der Lip-Sync-Intent **resolved** und identisch mit dem
  persistierten DB-Wert (kein Draft-Overlay)

## Produktivstand-Nachweis

Belegen, dass der aktive Bundle-Stand von `compose-twoshot-audio` und
`compose-dialog-segments` nach `T_FA4_P0_FANOUT_effective = 2026-08-17T19:51:45Z` liegt:

- erneuter Boot-/Validation-Smoke beider Functions (ungültige Payload, erwartete 4xx,
  keine Import-/Runtime-Fehler), Prüfzeitpunkt festhalten
- statische Sanity: Producer liefert `turn_id`, Consumer setzt `segmentId = turn_id`,
  `fa4_p0_turn_pass_mismatch`-Guard vorhanden, Adoption prüft `segment_id`

## Dokumentation

Abschnitt „FA-4 FINAL RETEST SETUP (S11)" in
`docs/v433-motion-studio-final-acceptance.md`: Szenen-ID, Cast-/Voice-Tabelle, Dialog,
Snapshot-Tabelle, Produktivstand-Nachweis, abgelesener Kostenvoranschlag.

## Abschluss

**FA-4 FINAL RETEST SETUP READY → STOP.** Kein Render. FA-1 bis FA-3 bleiben PASS,
alle vier Deploy-Gates bleiben VERIFIED. Der eine finale FA-4-Render startet erst nach
separatem GO.
