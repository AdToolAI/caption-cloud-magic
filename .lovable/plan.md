## Befund zur letzten Szene

Letzte Szene: `90aa26ee-e30d-45ac-8e01-52be8fa294b2`

Was die Logs zeigen:
- Der Clip wurde gebaut und Sync.so wurde für alle 4 Passes abgeschlossen.
- `compose-video-clips` hat v274/v276 korrekt gestartet: Rekognition hat `3/4` Sprecher erkannt und `v276_partial_soft_pass` erlaubt.
- Danach hat `compose-dialog-segments` aber gemeldet: `v275_assignment_lock source=existing locked_slots=0/4`.
- Anschließend fiel die Pipeline auf alte Anchor-/Geometrie-Fallbacks zurück: `faceMap=anchor`, `v183_unlabeled_fallback`.

Kurz: Sync.so lief, aber nicht mit dem Rekognition-Routing. Deshalb bewegen sich falsche oder keine passenden Sprecher.

## Wahrscheinliche Ursache

Der v274-Lock wird nicht stabil genug durchgereicht:

1. `compose-video-clips` speichert die Rekognition-Zuordnung in `audio_plan.twoshot.anchor_identity`.
2. In manchen Abläufen ist `dialog_shots` zu diesem Zeitpunkt noch leer, daher wird `dialog_shots.plate_identity.assignmentLock` nicht vorbefüllt.
3. `compose-twoshot-audio` schreibt später `audio_plan.twoshot` neu und übernimmt dabei nicht garantiert alle bereits parallel gespeicherten v274-Felder.
4. `compose-dialog-segments` akzeptiert den v274-Lock aktuell nur als „komplett“ als frozen source. Bei `3/4` Partial-Lock fällt er auf den alten Pfad zurück.

## Plan v277 — Rekognition-Lock wird echte Routing-Quelle

### 1. `compose-twoshot-audio` merge-sicher machen
- Vor dem finalen `audio_plan`-Update den neuesten Row-Stand nochmals lesen.
- `twoshot.anchor_identity`, `twoshot.speaker_priority_plates`, `twoshot.faceMap` und andere parallel erzeugte technische Felder erhalten.
- Damit überschreibt die Audio-Erzeugung keine vorher gespeicherten Identity-Ergebnisse mehr.

### 2. `compose-video-clips` persistiert den Lock an zwei stabilen Orten
- `audio_plan.twoshot.anchor_identity` bleibt erhalten.
- Zusätzlich wird `dialog_shots.plate_identity` auch dann initialisiert, wenn vorher noch kein `dialog_shots` existiert.
- Der gespeicherte Snapshot bekommt klaren Status:
  - `assignmentLockSource: "v274_anchor_rekognition_partial"` bei Teiltreffer
  - `assignmentLockSource: "v274_anchor_rekognition_complete"` bei Volltreffer

### 3. `compose-dialog-segments` nutzt Partial-Locks korrekt
- Auch ein `3/4` Rekognition-Lock darf nicht verworfen werden.
- Für gematchte Slots gilt Rekognition zwingend.
- Nur unresolved Slots fallen auf Row-Major/Geometrie zurück.
- Der Log soll danach nicht mehr `locked_slots=0/4` zeigen, sondern z. B. `locked_slots=3/4 source=v277_anchor_rekognition_partial`.

### 4. Alte Anchor-FaceMap darf Rekognition nicht überschreiben
- Wenn `anchor_identity.assignmentLock` vorhanden ist, darf `faceMap=anchor` oder `v183_unlabeled_fallback` nur noch für nicht erkannte Sprecher einspringen.
- Keine vollständige Rückkehr auf alte Koordinaten, sobald Rekognition mindestens einen Slot sicher erkannt hat.

### 5. Validierung nach Umsetzung
- Edge Functions deployen:
  - `compose-video-clips`
  - `compose-twoshot-audio`
  - `compose-dialog-segments`
- Danach bei einer neuen 4-Sprecher-Szene prüfen:
  - `compose-video-clips`: `v274_result resolved=X/4`
  - `compose-dialog-segments`: `v277_assignment_lock locked_slots=X/4`
  - `syncso_dispatch_log`: jeder Pass hat den passenden `character_id` und die passende Preclip-/BBox-Quelle

## Erwartetes Ergebnis

Die Pipeline bleibt Single-Take mit Tasks/Office-Aktionen, aber die Sprecher-Zuordnung wird nicht mehr durch spätere Audio-/Fallback-Schritte verloren. Damit sollte der Fall „Sync.so fertig, aber kein Sprecher getroffen“ deutlich reduziert werden.