# V473 / V474 — Zwei READ-ONLY-Gates: Detektor-Gültigkeit + Aktions-Durchreichung

Zwei getrennte Befunde, zwei getrennte Gates. Beide ohne Provider-Call, ohne Rerender,
ohne Codeänderung.

# V473 — Ist der NOOP-Detektor überhaupt gültig? (READ-ONLY)

Dein Einwand trifft einen wunden Punkt, und die eigenen Daten stützen ihn:

- Die V468-Aussage „Pass 0 = ~90° Profil, Mund nur Silhouette" stammt aus einer visuellen
  Betrachtung von Kontaktbögen, **nicht** aus Messdaten. Der eingefrorene Face-Track
  desselben Passes sagt das Gegenteil: `usable_frame_rate = 1.00`, `median_face_aspect = 0.687`,
  `mouth_landmark_rate = 1.00`, kein Silhouetten-Randtreffer. Das ist bereits in V472
  (Befund 1) dokumentiert und widerspricht der Profil-These.
- V466-B hat gezeigt: **kein einziger Pass ist unbearbeitet.** Auch die „NOOP"-Pässe
  editieren exakt das Mundband (Edit-Schwerpunkt 0.65–0.72 der Boxhöhe, identisch mit den
  grünen Pässen). „NOOP" heißt in unserer Messung *schwach relativ zur Bildbewegung*,
  nicht *nichts passiert*.
- V470/V471 haben für Pass 1 einen **belegten Fehlalarm** nachgewiesen (Mess-ROI zu hoch).

Damit ist die naheliegende Lesart nicht mehr „schwieriges Video", sondern:
**unser Verdikt bestraft genau den einfachen Fall.** `mouth_over_frame` normiert die
Mundänderung gegen die Gesamtbildbewegung. Bei ruhigen, frontalen Sprechern ist der Nenner
klein und das Bild ruhig — der Quotient kippt nach unten, obwohl der Lip-Sync visuell sitzt.
Der anspruchsvollere Startseiten-Clip lief nie gegen dieses Verdikt: es existierte damals
nicht.

Dieses Gate beweist oder widerlegt genau das. Kein Provider-Call, kein Rerender, keine
Codeänderung.

## Schritt 1 — Visuelle Evidenz gegen die Pose-Behauptung

Aus den gepinnten Preclips P0–P4 (`v434_artifact_pins`, Run `95b11254`, Gen 15) Kontaktbögen
neu ziehen und pro Pass festhalten: Yaw-Eindruck, Mundsichtbarkeit, Kopfbewegung.
Ergebnis wird schriftlich gegen die V468-Behauptung gestellt und diese, falls widerlegt,
in `docs/v468-pass-contract-differential.md` ausdrücklich als **zurückgezogen** markiert
(Doku-Korrektur, keine Logikänderung).

## Schritt 2 — Der entscheidende Kontrolltest: Startseiten-Clip gegen heutige Metrik

Der bekannte gute 4-Sprecher-Clip der deutschen Startseite ist die härteste Kontrollgruppe.
Geprüft wird:

1. Welche Verdikt-Logik dieser Lauf damals durchlaufen hat (Erwartung, zu belegen: gar keine
   `mouth_over_frame`-Bewertung, weil vor V465 entstanden).
2. Seine Pässe werden mit der **heutigen** Kette nachgerechnet: V469 → V471-ROI → V465 N=6
   → V466 Grauband.

Entscheidungsregel:

```text
Startseiten-Clip erhält heute für einen oder mehrere Turns NOOP
  → Metrik ist als Terminal-Gate falsifiziert. Sie klassifiziert einen
    nachweislich guten Clip als Fehler.

Startseiten-Clip bleibt durchgehend MOVED
  → Metrik hält, und der Unterschied liegt wirklich im S01-Material.
    Dann wird S01 Turn für Turn gegen den Startseiten-Clip gestellt.
```

## Schritt 3 — Konsequenz benennen (noch nicht implementieren)

Fällt Schritt 2 gegen die Metrik aus, lautet die Empfehlung für das Folge-Gate:

- `mouth_over_frame` verliert die **Terminalitäts**-Autorität und wird Telemetrie/Warnung.
- Ein Pass scheitert nur noch bei echtem Passthrough (Output bit-nah am Input) oder
  Provider-Fehler — nicht mehr wegen eines Schwellenwerts, den auch guter Lip-Sync reißt.
- V469 wird entsprechend entschärft, weil sein Auslöseanlass (die Profil-These) entfällt.

Das ist bewusst nur die Empfehlung. Umsetzung erst in einem eigenen, freigegebenen Gate.

## Ergebnis dieses Gates

Ein Bericht `docs/v473-detector-validity.md` mit: Kontaktbögen-Befund pro Pass, Nachrechnung
des Startseiten-Clips mit heutiger Kette, klarer Aussage „Metrik falsifiziert" oder
„Metrik hält" — und keiner Codeänderung.

## Technische Details

- Quellen: `v434_artifact_pins` (S01 Gen 15), Storage-Artefakte des Startseiten-Clips,
  `composer_pipeline_jobs` / Attempt-Telemetrie für die historischen Verdikte.
- Nachrechnung mit dem bestehenden Harness aus V471/V472 (Produktions-Still-Pfad,
  V471-ROI-Port, V465-Schwellen 2.00 / 2.65), read-only.
- Betroffene Doku bei Widerlegung: `docs/v468-pass-contract-differential.md`,
  `docs/v469-mouth-visibility-gate.md`, `mem/architecture/lipsync/v469-mouth-visibility-gate.md`.

---

# V474 — Warum landet die Regie nicht im Clip? (READ-ONLY)

Zweiter, davon unabhängiger Befund aus deinen Screenshots: Das Feld
„WAS PASSIERT IN DER SZENE? (ÜBERSCHREIBT DIRECTOR)" ist ausgefüllt (inkl. Auto-EN-
Übersetzung), aber die vier Felder „AKTION — WAS TUT <Name>?" sind leer (nur Platzhalter),
und im fertigen Clip tun die Figuren nichts davon.

Was der Code heute tut (belegt):

- `src/lib/motion-studio/applyActionsToPrompt.ts` schreibt Regie als zwei Markerblöcke
  `[SceneAction] … [/SceneAction]` und `[CastActions] - Name: … [/CastActions]` an den
  **Anfang** des `aiPrompt`.
- Diese Marker sind serverseitig nur in `compose-video-clips`, `compose-scene-anchor`,
  `compose-dialog-segments` und `happyhorse-green-net` bekannt.
- Leere Cast-Actions werden gefiltert; sind **alle** leer, entfällt der `[CastActions]`-Block
  vollständig. Es bleibt nur der Szenensatz.

Das Gate prüft genau drei Fragen an der realen Szene, entlang der gespeicherten Daten und
des tatsächlich gesendeten Payloads:

## Frage 1 — Werden die Aktionsfelder überhaupt jemals befüllt?

Wer schreibt `characterActions`: Briefing-Apply, Scene-Director oder nur manuelle Eingabe?
Geprüft wird der Persistenzpfad (`useComposerPersistence`, `useApplyProductionPlan`,
`scene-director`) und der DB-Stand der Szene. Ergebnis: entweder „es gibt keinen Autor,
das Feld ist reine Handeingabe" oder „es gibt einen Autor, der hier nicht gelaufen ist".

## Frage 2 — Kommt der Szenensatz im Provider-Prompt an?

Der eingefrorene Request der Szene wird ausgelesen und wörtlich gegen den UI-Text gestellt:
Steht `[SceneAction]` mit dem englischen Satz im gesendeten Prompt — ja oder nein? Falls
nein, wird der Punkt der Kette benannt, an dem er verloren geht (Persistenz, Prompt-Rebuild
oder Backend-Strip).

## Frage 3 — Kann diese Regie im Lip-Sync-Pfad überhaupt wirken?

Zentrale Hypothese, die dieses Gate belegen oder widerlegen soll: Bei einer Lip-Sync-Szene
entsteht das Bild aus dem **Anker-Standbild** plus Sync-Pässen. Bewegungsregie wie
„geht während der Szene nach rechts" oder „dreht sich zur Gruppe zurück" ist in einem
Standbild nicht darstellbar; ob und wo der Clip-Provider die Marker noch sieht, ist der
entscheidende Punkt. Geprüft wird, welcher Prompt an den Anker-Renderer und welcher an den
Clip-Provider geht, und ob Bewegungsregie darin überlebt.

## Ergebnis dieses Gates

Bericht `docs/v474-action-directive-trace.md` mit einer klaren Zuordnung pro Frage:
UI-Fehler (Feld wird nie befüllt) / Persistenz-Fehler / Prompt-Fehler / Architektur-Grenze
(Standbild kann keine Bewegung) — plus konkretem Fix-Vorschlag je Ursache, aber ohne
Umsetzung in diesem Gate.
