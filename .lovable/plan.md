## Kurzantwort

Nicht ganz: AWS Rekognition hat sehr wahrscheinlich **korrekt** getroffen — die Fehlstellung entsteht **nach** dem Detect, beim Zurückrechnen der normalisierten Koordinaten (0–1) auf Plate-Pixel.

Indizien dafür:
- Rekognition liefert immer normalisierte Werte relativ zum *übergebenen* Bild. Die Logs zeigen abwechselnd `plate=1928x1076` und `plate=720x720` — es wird also nicht immer dasselbe Bild vermessen wie später gecroppt.
- Die gespeicherten Boxen sind nicht zufällig verstreut, sondern **systematisch nach rechts/unten verschoben und in der Höhe gestaucht**. Ein Detektor, der danebenliegt, produziert Streuung; eine falsche Rücktransformation produziert genau dieses gleichmäßige Muster.
- Eine Box war 22×13 px groß — das ist keine Fehldetektion, das ist eine Box, die als `[x, y, w, h]` geschrieben und als `[x1, y1, x2, y2]` gelesen wurde (oder umgekehrt).

Der Fehler liegt also in unserem Code zwischen Rekognition-Antwort und `plate_identity`, nicht bei AWS. Bestätigen lässt sich das nur, indem ich denselben Frame erneut vermesse und die Rohantwort mit dem Gespeicherten vergleiche — das ist Schritt 2 unten.

---

## Plan v361 — Koordinatenvertrag reparieren

### Schritt 1: Beweis fixieren (Regressionsanker)
Test anlegen, der die gespeicherten `plate_identity`-Boxen der Szene 89c5e01c gegen die tatsächlichen Gesichtsregionen prüft (≥ 50 % Überlappung gefordert). Der Test schlägt mit dem aktuellen Datensatz fehl — genau das ist der Anker.

### Schritt 2: Ursache lokalisieren und beheben
Den Weg von der Rekognition-`BoundingBox` bis zur Pixel-Box durchgehen (AWS-Detect-Wrapper, `plateFaceSlotRouter.ts`, `pass-face-preclip.ts`). Zu klären:
- Wird das Bild vor dem Detect skaliert oder quadratisch gepolstert? Dann muss die Rücktransformation Offset **und** Skalierung exakt invertieren.
- Wird `[x, y, w, h]` geschrieben, aber `[x1, y1, x2, y2]` gelesen?
- Verifikation: Skript rendert den Plate-Frame mit den neu berechneten Boxen; ich prüfe das Bild visuell, bevor etwas ausgeliefert wird.

### Schritt 3: Sanity-Gate am richtigen Ort
Statt Geometrie-Gates auf dem Crop ein Gate auf der Detektion:
- Boxen mit unplausibler Größe (< 1 % oder > 60 % Plate-Breite) oder Seitenverhältnis außerhalb 0,5–1,6 verwerfen.
- Zweite Rekognition **auf dem fertigen 720×720-Preclip**: kein Gesicht gefunden → Pass gar nicht erst an Sync.so, sofortiger Abbruch mit Refund, protokolliert als `preclip_no_face`.
- `resolvedCount` darf die Sprecherzahl nicht überschreiten; doppelte `characterId` über mehrere Slots = Identitätskonflikt, Slot mit niedrigerer Confidence verwerfen.

### Schritt 4: Dispatch-Guard im Watchdog nachziehen
In `lipsync-watchdog/index.ts` denselben Terminal-Check wie in `compose-dialog-segments`: vor Retry/Dispatch `clip_status` lesen; ist die Szene terminal, Pass als `skipped_scene_failed` schließen, Credits erstatten, Sync.so-Slot freigeben. Die zwei hängenden Passes dieser Szene aufräumen.

### Schritt 5: Kontrolllauf
Dieselbe Vier-Sprecher-Szene neu rendern, die vier Preclips als Standbilder prüfen. Erst wenn auf allen vier ein vollständiges Gesicht mit sichtbarem Mund zu sehen ist, gilt der Fix als bestätigt.

---

## Technische Notizen
- Betroffene Dateien (Erwartung): AWS-Detect-Wrapper und `plateFaceSlotRouter.ts` unter `supabase/functions/_shared/`, `pass-face-preclip.ts`, ggf. `compute-mouth-centered-crop.ts`, `lipsync-watchdog/index.ts`.
- Die v356-Entscheidung (keine geometrischen Pre-Dispatch-Blocker) bleibt bestehen. Das neue Gate misst nicht Gesichtsgröße, sondern *Gesicht vorhanden ja/nein* auf dem tatsächlich abgeschickten Bild.
- Nebenbefund: `AWS_REGION='Global' is not a valid Rekognition region` — Fallback greift, wird aber sauber gesetzt.
