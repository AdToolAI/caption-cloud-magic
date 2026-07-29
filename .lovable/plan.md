## Autopilot Lip-Sync — Brücke in die Composer-Strecke (ohne Eingriff in die laufende Pipeline)

### Grundregel dieses Plans

`compose-dialog-segments` und alle geteilten Lip-Sync-Module (`pass-face-preclip.ts`, `plateFaceSlotRouter.ts`, `syncso-preflight.ts`, `syncso-face-gate.ts`, `twoshot-face-map.ts`, `sync-so-webhook`) werden **nicht angefasst** — kein neuer Parameter, kein neuer Zweig, keine Signaturänderung. Der Autopilot spricht die Strecke ausschließlich über ihre bestehende Eintrittstür an: eine Zeile in `composer_scenes` plus ein Aufruf mit `{ scene_id }`. Damit kann die Motion-Studio-Pipeline durch diese Arbeit strukturell nicht beschädigt werden.

Die einzige Ausnahme, die eine Änderung an einer geteilten Datei bedeuten würde, ist die Doppelbuchung (Block 3). Auch die wird ohne Codeänderung gelöst — siehe dort.

### Befund aus dem Code

- Die gehärtete Strecke existiert vollständig: `compose-dialog-segments` (7.899 Zeilen) mit Preclip (`renderPassFacePreclip`), Slot-Routing, Voiced-Windows, Codec-Preflight, Circuit-Breaker, Retry-Matrix, Audio-Mux und der Sync.so-Kette (Pass N Output = Pass N+1 Input).
- Der Autopilot nutzt bisher sein eigenes, schlankeres `_shared/autopilotLipSync.ts` (547 Zeilen) — ohne Preclip, ohne Codec-Preflight, ohne Watchdog. Daher das Ghost-Mouthing-Restrisiko bei 3–4 Sprechern.
- `compose-dialog-segments` ist tabellengebunden: es liest/schreibt `composer_scenes` (`dialog_turns`, `dialog_shots`, `clip_url`, `lip_sync_status`, `reference_image_url`) und der Webhook adressiert `?scene_id=…`. Es nimmt keine freien URLs entgegen — deshalb die Brücke über eine Szenenzeile.

---

### Block 1 — Shadow-Projekt & Szenenzeile (nur neue Zeilen, kein fremder Code)

1. Beim Produktionsstart legt `autopilot-orchestrate` einmalig eine versteckte `composer_projects`-Zeile an, markiert über ein neues Feld `origin='autopilot'`, verknüpft via `autopilot_productions.composer_project_id`. In der Composer-Projektliste wird nach `origin` gefiltert, damit nichts auftaucht.
2. Pro Dialogszene wird eine `composer_scenes`-Zeile geschrieben: `clip_url` = Hailuo-Motion-Clip, `reference_image_url` = Autopilot-Anker, `dialog_turns` = die bereits vorhandenen `turns[]` (identische Struktur, kanonische IDs), `dialog_script` aus den Turn-Texten.
3. `autopilot_production_scenes` merkt sich die `composer_scene_id`.

### Block 2 — Dispatch über die bestehende Tür

4. `speakAndSync` ruft statt `runLipSyncPasses` nun `compose-dialog-segments` mit `{ scene_id }` auf — exakt derselbe Aufruf, den das Motion Studio heute macht. Damit greifen Preclip-Isolation (beseitigt Ghost-Mouthing bei 3–4 Sprechern), Codec-Preflight, Face-Gate, Voiced-Windows, Retry-Matrix und Circuit-Breaker automatisch.
5. Die VO-Erzeugung bleibt beim Autopilot (`buildTurnTracks`, ElevenLabs, deutscher Hard-Lock). Die fertigen Turn-Audios werden in die Szenenzeile geschrieben, sodass der Composer nicht erneut synthetisiert.
6. Der Orchestrator pollt `composer_scenes.lip_sync_status` und spiegelt `final_url` nach `autopilot_production_scenes.lipsync_url`; bei `failed` greift der bestehende `refundStage`-Pfad.

### Block 3 — Keine Doppelbuchung, ohne Composer-Code zu ändern

7. Der Composer bucht gegen die Wallet des `user_id` der Szene. Statt einen Bypass in `compose-dialog-segments` einzubauen, dreht der Autopilot die Reihenfolge um: die Lip-Sync-Stufe wird im Autopilot **nicht mehr separat berechnet**, die Composer-Buchung ist die einzige. Der Autopilot liest die verbuchten Credits aus der Szene und zeigt sie in seiner Kostenaufstellung an. Eine Zeile Preisanzeige im Autopilot ändert sich, an der Abrechnungslogik des Composers nichts.
8. Motion-Retry (neu, rein im Autopilot): bei `clip_error` aus der Face-Gate-Familie (`face_validation_failed`, `bbox_geometry_insane`, Mindestgröße) rendert der Autopilot die Szene **einmal** mit gesichtsbetontem Framing-Suffix neu, statt Lip-Sync stumm zu überspringen.
9. `lipsync-watchdog` deckt die Szenen automatisch ab, sobald sie `composer_scenes` sind — er kennt die Tabelle bereits. Es kommt nur das Zurückspiegeln in die Autopilot-Zeile dazu.

### Block 4 — Aufräumen erst nach dem Grünlicht

10. `_shared/autopilotLipSync.ts` behält `buildTurnTracks`. `checkAnchorFaces` und `runLipSyncPasses` werden **noch nicht gelöscht**, sondern nur nicht mehr aufgerufen — falls die Brücke in der Praxis klemmt, ist der alte Autopilot-Pfad durch Umstellen einer Konstante zurück. Entfernt wird er erst, wenn eine 4-Sprecher-Produktion sauber durchgelaufen ist.
11. Shadow-Projekte werden mit der Produktion per Cascade gelöscht.

---

### Regressionsschutz für das Motion Studio

- Geänderte Dateien: `autopilot-orchestrate/index.ts`, `_shared/autopilotLipSync.ts` (nur Aufrufseite), Autopilot-UI-Kosten, eine Migration für `origin` + `composer_project_id` + Listenfilter.
- Nicht geänderte Dateien: `compose-dialog-segments`, `sync-so-webhook`, sämtliche `_shared`-Lip-Sync-Module.
- Migration ist additiv: neue nullable Spalten, keine Änderung an bestehenden Zeilen, `origin` mit Default `'composer'`, damit alle heutigen Projekte unverändert in der Liste bleiben.
- Vor dem ersten Insert wird das `composer_scenes`-Schema auf NOT-NULL-Spalten abgefragt, damit die Brückenzeile nicht halbfertig entsteht.
- Verifiziert wird zum Schluss beides: eine Autopilot-Produktion mit 4 Sprechern **und** eine normale Motion-Studio-Dialogszene, um zu belegen, dass der bestehende Weg unverändert läuft.
