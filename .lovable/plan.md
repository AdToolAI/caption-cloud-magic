# FA-4 RETEST SETUP v2 — frische Szene S10 (kein Render)

Ziel: den bewährten FA-4-Aufbau exakt auf einer jungfräulichen Szene S10 spiegeln, den Pre-Start-Snapshot read-only belegen, die Wirksamkeit der beiden produktiven Fixes (P1-A, P1-B) dokumentieren — und dann stoppen. Kein kostenpflichtiger Render in diesem Schritt.

## Ausgangslage

- S08 (`42bcdda1-…`) und S09 (`ece6a71c-118e-436a-ac1a-15182cc88ddb`) bleiben unangetastete Evidence: kein Reset, keine Wiederverwendung, keine manuellen Writes.
- FA-1 bis FA-3 bleiben PASS. P1-A und P1-B sind produktiv und frozen.
- Der Retest bekommt eine **neue** Szene S10 (nächster freier `order_index`) im Projekt `035273d7-…`.

## Aufbau der Retest-Szene S10

| Merkmal | Wert |
|---|---|
| scene_type | custom |
| duration | 15 s (Plate) |
| Modus | cinematic-sync, Lip-Sync-Intent intentional ON |
| Provider | `ai-happyhorse` (zertifiziert, frozen Capability Matrix) |
| Tightness | non-tight |
| Cast | 4 distinct Characters (Sarah, Samuel, Matthew, Kay) |
| Voices | 4 distinct deutsche Stimmen, je Character genau eine |
| Turns | 6, Sarah und Samuel je zweimal |
| Sprechzeit | Zielkorridor ~8–10 s im 15-s-Plate-Budget |

Dialog (neu formuliert, keine Textidentität mit S08/S09, gleiche Struktur und Länge):

```text
1 Sarah Dusatko:   Die Auswertung liegt vor.
2 Samuel Dusatko:  Klickrate ist deutlich gestiegen.
3 Matthew Dusatko: Vor allem die kurzen Schnitte wirken.
4 Kay Mark:        Dann skalieren wir die Variante.
5 Sarah Dusatko:   Einverstanden, gleiche Linie.
6 Samuel Dusatko:  Ich ziehe die Zahlen morgen früh.
```

Angelegt wird die Szene über die normale Studio-UI/Persistenz (Szene hinzufügen, Cast setzen, Voices binden, Skript schreiben, Lip-Sync-Intent ON) — keine manuellen DB-Writes, keine Migration, kein RS3-Marker, keine Pointer.

## Pre-Start-Snapshot (read-only, vor jeder Freigabe)

Nachzuweisen für S10:

- `active_run_id = NULL`
- `pipeline_state = idle`
- `composer_pipeline_jobs` für die Szene = 0 Zeilen
- keine `sync_segment`-/`audio_mux`-/`stitch`-Historie
- keine Pass-/Job-Pointer (kein aktiver Pass-Index, keine Segment-Pointer)
- `clip_url`, `base_video_url`, `processed_video_url`, `lip_sync_source_clip_url` alle NULL
- kein RS3-Marker (`rs3_reset_id` leer, kein `audio_plan.twoshot.rs3_reset`)
- 4 Cast-IDs bijektiv zu 4 Identitäten
- 4 Voice-IDs eindeutig, keine Doppelbelegung, Keys = characterId
- 6 Skriptzeilen eindeutig einem Sprecher zugeordnet
- Identity Gate: 6 Turns → exakt 4 stabile Character-IDs, Turn 1 = Turn 5, Turn 2 = Turn 6
- C1: nach vollem Reload ist der Lip-Sync-Intent **resolved** und stimmt mit dem persistierten DB-Wert überein (kein Draft-Overlay)

## Fix-spezifischer Nachweis (P1-A / P1-B)

Zu dokumentieren, dass der produktive Stand hinter beiden Fixes liegt:

- `T_FA4_P1A_effective = 2026-08-17T17:11Z` — ACL-gehärtete `composer_refund_charge` + Unique-Index produktiv; `recover-stuck-composer-clip` deployed.
- `T_FA4_P1B_effective = 2026-08-17T17:47Z` — Anchor-Encoding-Cache + blockweiser Base64-Encoder + Region-Sanity produktiv in `compose-video-clips` und `compose-dialog-segments`.
- Boot-/Validation-Smoke unmittelbar vor dem Setup-Abschluss: `compose-video-clips` und `compose-dialog-segments` booten ohne Import-/ReferenceError (ungültige Payload → erwartete 400er), Region-Fallback-Log plausibel.
- Prüfzeitpunkt im Report festhalten. Falls die Plattform keinen verlässlichen Deploy-Zeitstempel ausgibt, lautet der Eintrag: „letzter bekannter Deploy > T_FA4_P1B_effective, aktueller Bundle-Smoke erfolgreich" — daraus wird kein Finding.

## Dokumentation

Neuer Abschnitt „FA-4 RETEST SETUP v2 (frische Szene S10)" in `docs/v433-motion-studio-final-acceptance.md` mit Scene-ID, Cast-/Voice-Tabelle, Dialog, Snapshot-Tabelle, Identity-Gate-Tabelle, Fix-Nachweis und abgelesenem Kostenvoranschlag (nur abgelesen, nicht bestätigt).

## Abschluss

**FA-4 RETEST v2 SETUP READY → STOP.** Kein Render. Der eine kostenpflichtige 4-Speaker-Render startet erst nach separatem GO.
