## Befund zur letzten Szene

Die letzte relevante Szene ist `9cd16340-c893-45d2-821a-e4e7252d0272`.

**Kurzantwort:** Nein — die neue v278-Route wurde bei dieser Szene nicht genutzt.

**Warum ich das sagen kann:**
- In den Dispatch-Logs stehen nur alte `sync-segments`-Einträge mit `PREFLIGHT_BLOCKED` und `v153_plate_box_duplicate_for_speakers=[3]`.
- Es gibt keinen `v278_router ok=...`-Eintrag und keine v278-Metadaten in den Dispatch-Logs.
- In der Szene fehlt `dialog_shots.anchor_face_layout` komplett.
- In der Szene fehlt auch `dialog_shots.plate_identity`.
- Es existiert nur `audio_plan.twoshot.anchor_identity`, aber nur teilweise: `resolvedCount = 2`, `expectedCount = 4`.

## Was aktuell falsch läuft

Die v278-Route ist im Code vorhanden, startet aber nur wenn diese Bedingung erfüllt ist:

```text
N >= 3 Sprecher
UND dialog_shots.anchor_face_layout existiert
UND anchor_face_layout.slots.length >= Sprecheranzahl
```

Bei der geprüften Szene ist `anchor_face_layout` leer/nicht vorhanden. Dadurch fällt die Pipeline automatisch zurück in den alten v153/v274/v277-Pfad. Genau dort entsteht weiterhin die bekannte Fehlermeldung: zwei Sprecher werden auf dieselbe Plate-Box gemappt.

## Wahrscheinliche Ursache

Der aktuelle v278-Layout-Aufbau hängt noch zu stark am alten Rekognition/Identity-Ergebnis. Wenn die Anchor-Identität nur teilweise erkannt wird, hier 2 von 4, entsteht kein vollständiges `anchor_face_layout` für alle 4 Sprecher. Damit kann der neue Hungarian-Router gar nicht arbeiten.

Zusätzlich scheint der spätere Fehlerzustand `dialog_shots` auf ein reines Fehlerobjekt zu reduzieren, wodurch eventuell vorher vorhandene Routing-Daten nicht stabil erhalten bleiben.

## Plan zur sauberen Korrektur

### 1. v278 wirklich unabhängig von biometrischer Identität machen
`anchor_face_layout` darf nicht nur aus erfolgreich biometrisch erkannten Gesichtern entstehen.

Stattdessen:
- Anchor-Gesichter geometrisch erkennen.
- Sprecher-Reihenfolge aus der Szene/Dialogstruktur nehmen.
- Face-Slots bijektiv nach Anchor-Komposition zuordnen.
- Dadurch immer 4 Slots für 4 Sprecher erzeugen, solange 4 Gesichter im Anchor erkannt wurden.

### 2. `anchor_face_layout` dauerhaft schützen
Beim Schreiben von Fehlerstatus in `dialog_shots` darf `anchor_face_layout` nicht überschrieben/gelöscht werden.

Die Update-Logik soll immer mergen:

```text
bestehende dialog_shots behalten
+ status/error aktualisieren
+ anchor_face_layout/plate_identity nicht verlieren
```

### 3. v278 vor dem alten v153-Duplicate-Guard erzwingen
Wenn `anchor_face_layout` vollständig ist, muss der Hungarian-Router laufen, bevor der alte v153-Duplicate-Block entscheidet.

Erwartetes Ergebnis:

```text
v278_router ok=1 resolved=4/4
```

Erst wenn der Plate-Face-Count nicht passt, soll ein Review-/Soft-Gate greifen — nicht der alte Duplicate-Fail.

### 4. Diagnose sichtbar machen
In den Logs und optional im UI sollte klar stehen, welcher Pfad genutzt wurde:

```text
Route: v278 Hungarian
Anchor layout: 4/4
Plate faces: 4/4
Assignment: unique/bijective
```

So sehen wir sofort, ob die neue Route wirklich aktiv war.

### 5. Letzte Szene nach Fix gezielt zurücksetzen
Nach der Code-Korrektur würde ich genau diese Szene oder den letzten Re-Render so zurücksetzen, dass sie mit der korrigierten v278-Route erneut durchläuft, ohne dass der alte v153-Fehlerpfad wieder gewinnt.

## Erwartung nach Umsetzung

Diese konkrete Fehlerklasse sollte dann verschwinden:

```text
Samuel und Kailee wurden auf dasselbe Gesicht gemappt
v153_plate_box_duplicate_for_speakers
```

Denn der Hungarian-Router vergibt jedes erkannte Plate-Gesicht nur einmal. Die Verwechslung kann dann nicht mehr durch Duplicate-Zuweisung entstehen, sondern höchstens noch durch echten Face-Count-Mismatch oder starke Positionsverschiebung — dafür wäre dann ein Review-Gate statt ein harter Fehlalarm zuständig.