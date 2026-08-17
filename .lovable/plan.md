# FA-4 RETEST SETUP — frische 4-Speaker-/6-Turn-Szene (kein Render)

Ziel: exakt den bewährten FA-4-v2-Aufbau auf einer jungfräulichen Szene spiegeln,
den Pre-Start-Snapshot read-only belegen und danach stoppen. Kein kostenpflichtiger
Render in diesem Schritt.

## Ausgangslage (belegt, read-only)

Projekt `035273d7-…` enthält heute 8 Szenen (order_index 0..7). Die FA-4-Szene
S08 (`42bcdda1-…`, order_index 7) steht auf `pipeline_state=failed` mit
`active_run_id=56955451-…` — sie bleibt als Evidence unangetastet und wird nicht
wiederverwendet, resettet oder gelöscht.

Der Retest bekommt deshalb eine **neue** Szene S09 (order_index 8).

## Aufbau der Retest-Szene S09

| Merkmal | Wert |
|---|---|
| scene_type | custom |
| duration | 15 s (Plate) |
| Modus | cinematic-sync, Lip-Sync-Toggle intentional ON |
| Provider | zertifiziert gemäß frozen Capability Matrix (HappyHorse Multi-Speaker) |
| Tightness | non-tight |
| Cast | 4 distinct Charaktere (Sarah, Samuel, Matthew, Kay) |
| Voices | 4 unterschiedliche deutsche Stimmen (Sarah / George / Liam / Brian) |
| Turns | 6, Sarah und Samuel je zweimal (Wiederholungszuordnung) |
| Sprechzeit | Zielkorridor ~8–10 s (UI-TTS-Prognose) bei 15-s-Plate |

Dialog (neu formuliert, damit die Szene keine Textidentität mit S08 teilt, gleiche
Struktur und Länge):

```text
1 Sarah Dusatko:   Kurzer Blick auf die Zahlen.
2 Samuel Dusatko:  Reichweite liegt über Plan.
3 Matthew Dusatko: Die neuen Motive ziehen besser.
4 Kay Mark:        Dann heben wir das Budget an.
5 Sarah Dusatko:   Gut, wir halten den Kurs.
6 Samuel Dusatko:  Report kommt heute Abend.
```

Angelegt wird die Szene über die normale Studio-UI/Persistenz (Szene hinzufügen,
Cast setzen, Voices binden, Skript schreiben, Lip-Sync-Intent ON) — keine
manuellen DB-Writes, keine Migration, kein RS3-Marker, keine Pointer.

## Pre-Start-Snapshot (read-only, vor jeder Freigabe)

Nachzuweisen für die neue Szene:

- `active_run_id = NULL`
- `pipeline_state = idle`
- `composer_pipeline_jobs` für die Szene = 0 Zeilen
- keine `sync_segment`-/`audio_mux`-/`stitch`-Historie
- keine Pass-/Job-Pointer (kein aktiver Pass-Index, keine Segment-Pointer)
- `clip_url`, `base_video_url`, `processed_video_url` alle NULL
- kein RS3-Marker (`rs3_reset_id` leer)
- 4 Cast-IDs bijektiv zu 4 Identitäten
- 4 Voice-IDs eindeutig, keine Doppelbelegung
- 6 Skriptzeilen eindeutig einem Sprecher zugeordnet
- C1: nach vollem Reload ist der Lip-Sync-Intent **resolved** und stimmt mit dem
  persistierten DB-Wert überein (kein Draft-Overlay)

## Fix-spezifischer Preflight-Nachweis

Zusätzlich wird belegt, dass der produktive Bundle-Stand von
`compose-dialog-segments` und `invoke-remotion-render` **nach**
`T_FA4_P0_effective = 2026-08-17T09:35:01Z` liegt:

- erneuter Boot-/Validation-Smoke beider Functions unmittelbar vor dem Setup-Abschluss
  (ungültige Payload, erwartete 400er),
- Auslesen der Function-Metadaten/Logs mit Deploy-Zeitstempel > T,
- Festhalten des Prüfzeitpunkts im Report.

Damit ist später eindeutig, dass ein etwaiger Preclip-Dispatch über den neuen
Exactly-Once-Code lief.

## Dokumentation

Neuer Abschnitt „FA-4 RETEST SETUP (frische Szene S09)" in
`docs/v433-motion-studio-final-acceptance.md` mit Szenen-IDs, Cast-/Voice-Tabelle,
Dialog, Snapshot-Tabelle, Preflight-Nachweis und Kostenvoranschlag (nur abgelesen).

## Abschluss

**FA-4 RETEST SETUP READY → STOP.** Kein Render. FA-1 bis FA-3 bleiben PASS,
FA-4/P0 bleibt DEPLOY VERIFIED. Der eine Retest-Render startet erst nach
separatem GO.
