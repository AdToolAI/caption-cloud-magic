# V475 → V473 → V474 — drei READ-ONLY-Gates

Reihenfolge: V475 (Master-Audit v400-Konformität) → V473 (Detektor-Gültigkeit) →
V474 (Aktions-Durchreichung). Kein Provider-Call, kein Rerender, keine Codeänderung.
V475 steht weiter unten ausführlich, wird aber zuerst ausgeführt.

# V473 — Kann die heutige Kette guten Lip-Sync von Passthrough unterscheiden? (READ-ONLY)

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

Korrektur der Arbeitshypothese: `mouth_over_frame = mouth_edit / frame_edit`. Ein
**kleiner** Nenner erhöht den Quotienten. Die frühere Formulierung „ruhiger Sprecher →
kleiner Nenner → niedriger Score" war mathematisch falsch und ist gestrichen. Die einzig
zulässige Hypothese lautet:

> Starke globale Plate-/Kamerabewegung **erhöht** den Nenner und kann echte lokale
> Mundbearbeitung unter die Schwelle drücken.

Die Fragestellung ist neutral, nicht falsifizierend gemeint:

> Kann die heutige Kette (V469 → V471-ROI → V465 → V466) einen historisch visuell
> bestätigten Lip-Sync korrekt von einem Passthrough unterscheiden?

Ergebnis darf in beide Richtungen ausfallen.

## Schritt 1 — Visuelle Evidenz gegen die Pose-Behauptung + V469 empirisch nachrechnen

Aus den gepinnten Preclips P0–P4 (`v434_artifact_pins`, Run `95b11254`, Gen 15) Kontaktbögen
neu ziehen und pro Pass festhalten: Yaw-Eindruck, Mundsichtbarkeit, Kopfbewegung.
Die V468-Behauptung „P0 ≈ 90° Silhouette" wird bei Widerlegung in
`docs/v468-pass-contract-differential.md` als **zurückgezogen** markiert (Doku-Korrektur).

Wichtig: Daraus folgt **nicht**, dass V469 falsch ist. V469 prüft heute Mouth-Visibility
(Landmarks, Face-Aspect, Mund-Margin, usable frames), nicht Yaw. V469 wird deshalb
**empirisch** re-evaluiert:

- V469 lässt P0 trotz `mouth_landmark_rate = 1.00` / `usable_frame_rate = 1.00` durch
  → V469 verhält sich korrekt, keine Entschärfung.
- V469 würde ihn trotz dieser Werte blocken → echter Gegenbeweis, dann Handlungsbedarf.

## Schritt 2 — Kontrolltest: Startseiten-Clip gegen die heutige Kette

Der bekannte gute 4-Sprecher-Clip der deutschen Startseite ist die härteste Kontrollgruppe.
Geprüft wird:

1. Welche Verdikt-Logik dieser Lauf damals durchlaufen hat (zu belegen, nicht anzunehmen).
2. Seine Pässe werden mit der **heutigen** Kette nachgerechnet: V469 → V471-ROI → V465 N=6
   → V466 Grauband inklusive einmaliger N=16-Nachmessung.

Entscheidungsregel — die Messlatte ist **Terminalität**, nicht MOVED:

```text
Visuell + artefaktseitig bestätigter Lip-Sync erhält nach vollständigem
V466-Pfad ein TERMINALES NOOP
  → Terminalitätsautorität von mouth_over_frame ist falsifiziert.

Ergebnis MOVED oder INDETERMINATE → motion_unverified
  → keine Falsifikation. Grauband ist erlaubtes, nicht-terminales Verhalten.
  Beispiel: 3 MOVED + 1 motion_unverified = Metrik hält.
           2 MOVED + 2 terminale NOOP bei sichtbar gutem Lip-Sync = falsifiziert.
```

## Schritt 3 — Konsequenz benennen (noch nicht implementieren)

Nur falls Schritt 2 die Terminalität falsifiziert:

- `mouth_over_frame` verliert die **Terminalitäts**-Autorität und wird Telemetrie/Warnung
  bzw. schlimmstenfalls Grauband — es bleibt als Ranking-Metrik gültig (AUC 0.980).
- Ein Pass scheitert dann nur noch bei echtem Passthrough (Output nahezu identisch zum
  Input, im Sinne des v400-Vertrags) oder bei Provider-Fehler.
- V469 wird **nicht** pauschal mit entschärft; über V469 entscheidet allein das empirische
  Ergebnis aus Schritt 1.

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

## Frage 3 — Erreicht die Regie den I2V-Prompt der T4-Plate-Generierung?

Korrigierte Fragestellung. Die frühere Annahme „Lip-Sync-Bild entsteht aus dem Standbild"
widerspricht v400 und ist gestrichen. v400 sagt:

```text
Anchor-Bild → T4 Image-to-Video → bewegte Plate → Preclips → Lip-Sync
```

Körperbewegung (gehen, drehen, Tablet prüfen) muss also in **T4** entstehen. Sync.so soll
Bewegung nicht nachträglich erfinden, es synchronisiert nur den Mund auf einer bereits
bewegten Plate.

Verfolgt wird deshalb genau diese Kette, Station für Station, mit Beleg an jeder Stelle:

```text
UI SceneAction / characterActions
  → persistierter Scene State
  → applyActionsToPrompt
  → finaler aiPrompt
  → compose-video-clips
  → T4-Provider-Prompt
  → HappyHorse / Kling / Seedance Request
```

Und erst getrennt davon: Plate → Preclip → Sync.so.

Ergebnis ist binär:

- **Action-Block erreicht T4, Bewegung entsteht trotzdem nicht** → Prompt-Formulierungs-
  bzw. Provider-Befolgungsproblem (Modellgrenze), kein Pipelinefehler.
- **Action-Block erreicht T4 nicht** → unser Pipelinefehler, exakte Verlustkante wird benannt.

## Ergebnis dieses Gates

Bericht `docs/v474-action-directive-trace.md` mit einer klaren Zuordnung pro Frage:
UI-Fehler (Feld wird nie befüllt) / Persistenz-Fehler / Prompt-Verlust vor T4 /
Provider-Befolgung — plus konkretem Fix-Vorschlag je Ursache, aber ohne
Umsetzung in diesem Gate.

---

# V475 — v400-Konformitätsaudit der heutigen Pipeline (READ-ONLY)

Deine Frage „ist v400 überhaupt richtig umgesetzt?" wird nicht mit einer Meinung
beantwortet, sondern als Vertrag-für-Vertrag-Abgleich gegen den Code. Grundlage ist die
von dir gelieferte Vollspezifikation (T1–T16 plus die vier Grundverträge, Fehlercode-
Referenz und Nachbau-Checkliste).

Für **jeden** Punkt genau ein Urteil, jeweils mit Codebeleg (Datei + Stelle) oder
Gegenbeleg:

```text
ERFÜLLT           Code tut genau das, was v400 fordert
ABGEWICHEN        Verhalten existiert, aber mit anderem Schwellenwert/anderer Quelle
FEHLT             kein Codepfad vorhanden
ÜBERSCHRIEBEN     durch ein späteres Gate (V441–V472) bewusst ersetzt
```

Besonderes Augenmerk auf die Stellen, an denen spätere Gates v400 verändert haben:

- **Outcome-Gate (Grundvertrag 4 / T12):** v400 kennt `moving / static / unknown` mit
  „static = Passthrough". Heute entscheidet `mouth_over_frame` mit Schwellen 2.00/2.65
  plus Grauband. Das ist eine andere Definition von Fehlschlag — das Audit hält fest, ob
  das eine Verschärfung gegenüber v400 ist und ob sie den ursprünglichen Zweck
  (stille Passthroughs verhindern) noch trifft oder darüber hinausschießt.
- **Face-Gate (T9):** Schwellen 0.24 / 144 px / Mund nicht am Rand — steht V461 dazu deckungsgleich?
- **Preclip-Framing (T8):** fordert Mund bei 62 % Höhe; heute liefert V471 den Mund-Anker
  bei Face-Ratio 0.88. Beides ist derselbe Zweck, aber in unterschiedlichen Bezugsrahmen —
  wird explizit gegeneinander gerechnet.
- **Anchor-Kohärenz (Grundvertrag 2 / T3/T5):** Geometrie ausschließlich auf
  `reference_image_url`, Rekognition auf dem Anchor-Standbild, nicht auf Video-Frames.
- **Run-Identität, Assignment-Lock, Run-Guard, Watchdog, Refund-Idempotenz** je einzeln.
- **Fehlercode-Referenz (Abschnitt 17):** existiert jeder Code noch, und feuert er an der
  von v400 vorgesehenen Stelle? Neue Codes (`ssw:noop_fail`,
  `lipsync_input_contract_violation`, `preclip_mouth_not_visible`) werden zugeordnet.

## Ergebnis dieses Gates

Bericht `docs/v475-v400-conformance.md`: eine Zeile pro v400-Punkt mit Urteil und Beleg,
darunter eine kurze Liste „Abweichungen, die den Ausfall erklären können" —
nach Wirkung sortiert, ohne Codeänderung in diesem Gate.

---

# Reihenfolge

V475 zuerst (beantwortet deine Grundfrage), dann V473 (Detektor-Gültigkeit),
dann V474 (Aktions-Durchreichung). Alle drei read-only, kein Rerender.
