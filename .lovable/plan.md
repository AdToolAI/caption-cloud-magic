## Kurzantwort auf deine zwei Fragen

**1) Wird AWS Rekognition wirklich im Anchor abgerufen?**
Nein — für die letzte erfolgreiche Szene `fa7b1caf…` ist `audio_plan.twoshot.anchor_identity` in der DB **`NULL`**. Unser v274-Log-Marker `v274_rekognition_id` taucht in den Function-Logs nicht auf. Was in `dialog_shots.plate_identity` steht (`version: "v242"`, fester `matchConfidence: 0.85`) kommt vom **alten Gemini-Post-Hoc-Pfad in `compose-dialog-segments`**, nicht von Rekognition. → Der v274-Anker-Match läuft entweder gar nicht oder wird gleich wieder überschrieben. Deshalb bringt v274 aktuell nichts fürs Routing.

**2) Zurück auf Nano Banana 2 für den Anker?**
Nicht wegen des Lip-Syncs — das Anker-Modell ist nicht die kaputte Stelle. Der Fehler sitzt bei „welches Gesicht bekommt welches Audio", nicht bei „wer sieht wie aus". Modelwechsel würde nur die Anti-Grid/Environment-Härtung aus v271/v272 wieder verlieren. Anker bleibt Gemini 3 Pro.

## Plan v275 — v274 fertigverdrahten & Identity-Overwrite stoppen

### Ursache in einer Zeile
`compose-dialog-segments` rechnet Identität **nach dem Anker nochmal neu** (Gemini/v242 auf dem gerenderten Clip) und überschreibt damit alles, was v274 auf dem Anker sauber via Rekognition zugeordnet hat.

### Änderungen (chirurgisch, kein neuer Feature-Layer)

1. **`compose-video-clips` — v274 verifizierbar machen**
   - Zwei Pflicht-Logs pro N≥2-Szene: `v274_enter scene=… n=…` (immer) + `v274_result …` (nach dem Call).
   - Fehlerpfad schreibt `audio_plan.twoshot.anchor_identity = { method: "rekognition", ok: false, reason: <string> }` statt still zu schlucken — so sehen wir in der DB, dass es lief.
   - Kein Environment-Check umgehen: wenn `AWS_ACCESS_KEY_ID` fehlt, einmalig als `reason: "aws_creds_missing"` markieren.

2. **`compose-dialog-segments` — Rekognition-Lock hat Vorrang**
   - Wenn `audio_plan.twoshot.anchor_identity.ok === true` und `assignmentLock` vollständig ist (`resolvedCount === speakerCount`):
     - `assignmentLock` wird **eingefroren** und darf vom v242-Pfad nicht ersetzt werden.
     - v242 darf nur noch `bboxes/mouths/center` aus dem Clip nachziehen (Geometrie), aber die `slot → characterId`-Zuordnung bleibt die vom Anker.
   - Nur wenn Rekognition **nicht** vollständig lief, fällt es auf den heutigen Gemini-Pfad zurück (heutiges Verhalten).

3. **Latenz-Fix (die 1 Sekunde)**
   - v274 läuft parallel zu **Step B** (Focus-Plate-Prep) statt davor: `Promise.all([resolveIdentityViaRekognition(...), prepareFocusPlates(...)])`.
   - Netto-Overhead danach: ~0 ms, weil Rekognition (~800 ms) hinter dem längeren Focus-Plate-Job verschwindet.

4. **Kein Anker-Modellwechsel.** Kein UI-Change. Kein neuer State (`awaiting_manual_face_map` aus v274 bleibt wie er ist).

### Verifikation nach Deploy
Neue Szene mit 4 Sprechern rendern, dann:
```sql
SELECT id,
  audio_plan->'twoshot'->'anchor_identity'->>'method'         AS m,
  audio_plan->'twoshot'->'anchor_identity'->>'resolvedCount'  AS r,
  audio_plan->'twoshot'->'anchor_identity'->>'reason'         AS why,
  dialog_shots->'plate_identity'->>'version'                  AS v,
  dialog_shots->'plate_identity'->'assignmentLock'            AS lock
FROM composer_scenes WHERE id = '<neue-szene>';
```
Erwartung: `m = "rekognition"`, `r = 4`, `lock` identisch zu dem, was in `anchor_identity.assignmentLock` steht. Log zeigt `v274_enter` + `v274_result` + neu `v275_lock_frozen`.

### Was NICHT geändert wird
Sync.so-Payload, Focus-Plate-Erzeugung, Anker-Prompts, UI, Kling-/Hailuo-Dispatch, Credits, `awaiting_manual_face_map`-Review-Dialog.

### Erwartetes Ergebnis
- Lip-Sync trifft die richtigen Gesichter, weil das Rekognition-Mapping nicht mehr vom v242-Post-Hoc-Pfad überschrieben wird.
- Die zusätzliche Sekunde verschwindet (parallelisiert).
- Sichtbarer DB-Beweis pro Szene, dass Rekognition wirklich lief.
