## Bewertung der externen Analyse

Drei Punkte sind gegen den Code verifiziert und echte Defekte:

1. **Generations-Race (belegt)** — `stamp_plate_generation` stempelt `plate_generation` zum Schreibzeitpunkt. Ein verspäteter Render aus einer alten Generation wird als aktuell markiert. Der Generations-Vertrag aus v373 hat hier ein Loch.
2. **4 Frames pro Pass (belegt)** — `mouth-motion-verdict.ts:111`. Beweist „kein Passthrough", nicht „guter Sync".
3. **Kein Final-Output-Gate** — T16 setzt direkt `ready`.

Nicht übernommen (bewusst): AV-Sync-Score (T15c), Outbox-Pattern, Fencing-Token. Zu großer Aufwand für den Nutzen bei 3 Slots und einem Watchdog; als Backlog nach Launch.

## v375 — Unveränderliche Plate-Generation

- Neue Tabelle `plate_attempts` (`scene_id`, `expected_plate_generation`, `provider`, `provider_job_id`, `status`, `clip_url`, `superseded_at`).
- `compose-video-clips` legt den Attempt **vor** dem Provider-Dispatch mit der zum Dispatch gültigen Generation an.
- Das Render-Ergebnis schreibt nur noch über den Attempt: `UPDATE ... WHERE id = :attempt AND expected_plate_generation = (SELECT plate_generation FROM composer_scenes ...) AND status='rendering'`. Trifft es nicht, wird der Attempt als `superseded` abgelegt und `composer_scenes` **nicht** angefasst.
- `stamp_plate_generation` stempelt nicht mehr blind; die Generation kommt aus dem Attempt.

## v376 — Hard-Reset: erst invalidieren, dann aufräumen

Reihenfolge in `_shared/scene-hard-reset.ts` umdrehen:
1. Transaktion: `plate_generation + 1`, offene Attempts + Passes auf `superseded` mit `superseded_by_generation`.
2. Commit.
3. Danach best-effort: Provider-Cancel, Slot-Freigabe.
4. Artefakt-Purge nur für Generationen, die älter als die vorletzte sind (Tombstone statt Sofortlöschung), damit verspätete Webhooks ihren Bezug behalten.

## v377 — Plate-Viability-Audit (T7.5)

Neues Gate nach dem Plate-Render, vor der Dialog-Segmentierung. Nutzt das bereits vorhandene Rekognition-Tracking:
- Cast-Identität pro Sprecher gegen die Face-Collection (`_shared/rekognition-face-collection.ts`).
- Identity-bound Tracking: nach Track-Verlust wird **nicht** die nächstliegende Box übernommen, sondern per FaceId re-identifiziert; scheitert das, gilt der Turn als nicht auditierbar.
- Sichtbarkeit + Mundgröße **innerhalb des jeweiligen Sprechintervalls**, nicht global.
- Ergebnis als `plate_viability` in `composer_scenes`; Fail → Szene fehlschlagen + Refund, statt teuer zu dispatchen.

## v378 — Turn-basiertes Verdict statt Pass-Verdict

`mouth-motion-verdict.ts` bekommt Prüf-Fenster **pro Turn** statt 4 Frames pro Pass:
- je Turn 3 Fenster, gelegt auf Audio-Energiespitzen des Turn-Audios.
- Pass besteht nur, wenn jeder relevante Turn besteht.
- Aufteilung der Verdikte: `T15a ingest` (Datei lesbar, Dauer, Auflösung, Checksumme, Übernahme in eigenen Storage) → `T15b motion` (bestehend) → `T15d collateral` (Nicht-Sprecher dürfen sich im Pass nicht bewegen — Mund-ROI der übrigen Cast-Mitglieder gegen das Plate vergleichen).

## v379 — Final-Scene-Verdict + atomarer Publish

- T16 setzt künftig `clip_status = 'rendered'`, nicht `ready`.
- Neue Prüfung `final-scene-verdict`: Datei vollständig, Dauer in Toleranz, Audio-Stream vorhanden, keine Black/Freeze-Sequenzen, richtiger Sprecher bewegt sich je Turn, keine sichtbaren Cropnähte.
- Erst danach in einer Transition `ready` + Credit-Commit.

## v380 — Reservierungsmodell für Credits

- Reservierung bei T1, Provider-Kosten am Run, Commit erst bei erfolgreichem Publish (T18), Freigabe bei terminalem Systemfehler.
- Append-only Ledger mit Unique-Constraint auf (`run_id`, `reason_code`), damit doppelte Refunds technisch unmöglich sind.
- `decideRefund` bekommt die vom Reviewer genannten fünf Fälle; „Nutzer-Reset nach kostenpflichtigem Dispatch" wird gezählt und ab einem Schwellwert nicht mehr voll erstattet.

## Reihenfolge

v375 + v376 zuerst (echte Datenkorruption). Dann v378, dann v379. v377 und v380 danach.

## Technische Details

Betroffen: Migration für `plate_attempts` + Ledger, `_shared/scene-hard-reset.ts`, `compose-video-clips`, `compose-dialog-segments`, `_shared/mouth-motion-verdict.ts`, `sync-so-webhook`, `render-sync-segments-audio-mux`, `lipsync-watchdog` (muss `slot_wait` von `provider_runtime` unterscheiden, sonst timeoutet Sprecher 4 fälschlich).
