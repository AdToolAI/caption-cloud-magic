# Plan v341 – Lip-Sync-Stabilisierung statt weiterer Einzel-Patches

## Verifizierter aktueller Befund

- Der neue Lauf scheitert tatsächlich bereits im Preflight: **22,4 % Face-Share bei geforderten 30 %** (`PREFLIGHT_BLOCKED`, 22:05 UTC). Sync.so wurde dabei richtigerweise nicht mehr aufgerufen und **512 Credits wurden erstattet**.
- Die aktuelle v340-Teilimplementierung ersetzt ein fehlendes echtes Mund-Landmark durch einen **geschätzten Punkt bei 72 % der Gesichtsbox** und bezeichnet den Crop anschließend trotzdem als `anchor="mouth"`. Damit wird die angekündigte Landmark-Pflicht faktisch umgangen.
- Gleichzeitig wurde der Mehrsprecher-Floor von 24 % auf 30 % erhöht. Der synthetische Mundpunkt löst also den neuen Crop-Pfad aus, dessen Ergebnis dann am neuen Floor scheitert. **Das ist die aktuelle direkte Ursache des sichtbaren Fehlers.**
- Der alte Motion-Test ist ebenfalls nicht beweiskräftig: Die vorherigen vier Pässe wurden mit extrem hohen Gesamtbewegungswerten als bestanden markiert, obwohl visuell keine korrekte Mundbewegung vorlag.
- Die Cast-&-World-Anchor-Pflicht vor der Plate-Erzeugung und der echte Mundband-Test sind noch nicht umgesetzt. v340 ist daher kein vollständiger End-to-End-Fix.

## Umsetzung

### 1. Widersprüchliche v340-Teiländerung entfernen
- Einen synthetisch aus der Gesichtsbox berechneten Punkt **nicht mehr als echtes Mund-Landmark akzeptieren**.
- `anchorSource` strikt unterscheiden: echtes Landmark, geschätzter Fallback, kein Anchor.
- Bei Mehrsprechern nur echte, auf der gerenderten Plate gemessene Landmarks für den produktiven Dispatch zulassen.
- Face-Share nicht durch einen pauschalen höheren Floor „reparieren“; Crop-Ziel und Mindestwert aus derselben validierten Gesichtsbox berechnen und unmögliche Geometrie vor dem Rendern eindeutig klassifizieren.

### 2. Einen einzigen kanonischen Face-Detection-Pfad herstellen
- Plate-Frame extrahieren und alle sichtbaren Gesichter samt Box, Mundpunkten und Konfidenz einmal erfassen.
- Genau diese Ergebnisse für Identitätszuordnung, Crop, Sprecherkoordinaten und Motion-Probe verwenden; keine Mischung aus Anchor-, Track- und Plate-Koordinatenräumen.
- Für jeden Sprecher persistieren: Detektor, echte Landmark-Konfidenz, Face-Box, Mundpunkt und Koordinatenraum.
- Fehlen bei einer Mehrsprecher-Plate verwertbare Landmarks, einmal Plate neu erzeugen; danach sauber abbrechen und automatisch erstatten, statt weitere Fallbacks zu stapeln.

### 3. Cast-&-World-Identität vor Videoerzeugung erzwingen
- Plate-Erzeugung erst starten, wenn ein bestätigter Anchor aus den zugeordneten Cast-&-World-Referenzbildern vorhanden ist.
- `reference_image_url` pro Dialogsprecher in den kanonischen Szenendaten mitführen.
- Gesicht-zu-Sprecher-Zuordnung gegen die Referenzbilder prüfen; keine reine Links-nach-rechts-Zuordnung als produktiven Fallback verwenden.

### 4. Sync.so-Payload aus den validierten Plate-Daten bauen
- Pro Pass echte `coordinates` und `frame_number` aus dem Plate-Landmark mitsenden.
- Vor Dispatch prüfen: richtige Sprecher-ID, genau ein Zielgesicht im Preclip, Mundpunkt innerhalb des Crops und kein Nachbargesicht im Crop.
- Alte Trust-Ausnahmen (`trusted_preclip_without_probe`, konstruktives Vertrauen bei fehlender Messung) für Mehrsprecher entfernen.

### 5. Qualitätsprüfung auf tatsächliche Lippenbewegung umstellen
- Nicht mehr die Gesamtbewegung des weiten Crops messen.
- Nur ein enges Mundband über mehrere Frames analysieren und gegen eine ruhige Kontrollregion an Wange/Stirn normalisieren.
- Kopf-/Körperbewegung bei geschlossenem Mund muss als No-Op erkannt werden.
- Erst nach bestandenem Mundband-Test darf ein Pass `done` werden und in den finalen Mux gelangen; Timeout oder No-Op führt idempotent zur Erstattung.

### 6. Atomar testen, dann erst produktiv freigeben
- Reproduzierbare Tests für 1, 2 und 4 Sprecher anlegen, inklusive der aktuellen Szene als Fehler-Fixture.
- Negativfälle abdecken: fehlendes Landmark, falsche Identität, zu kleines Gesicht, Nachbargesicht im Crop, statischer Provider-Output und hängender Motion-Probe.
- Einen frischen 4-Sprecher-Lauf vollständig prüfen. Freigabekriterien:
  - bestätigter Cast-&-World-Anchor,
  - vier eindeutige Plate-Identitäten,
  - vier echte Mund-Landmarks,
  - vier Payloads mit Koordinaten und Frame-Nummern,
  - vier bestandene Mundband-Differenztests,
  - visuelle Übereinstimmung mit den Referenzcharakteren.
- Bis diese Kriterien erfüllt sind, wird der Lauf nicht als „behoben“ bezeichnet und es werden keine weiteren Schwellenwert-Patches einzeln ausgerollt.

## Technische Grenze

Die Änderung wird als zusammenhängender Pipeline-Fix umgesetzt: Plate-Anchor → Plate-Detection → Identity-Mapping → Preclip → Dispatch → Mouth-Motion-Gate → Mux. Dadurch entfernen wir die inzwischen widersprüchlichen v329/v331/v334/v336/v338/v340-Ausnahmen aus dem Mehrsprecherpfad, statt eine weitere Ausnahme darüberzulegen.