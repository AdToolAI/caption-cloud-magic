**Ziel:** Den bewiesenen Kailee-Fehler beheben — das Gesicht wandert zeitlich aus einem zeitlich konstanten Ausschnitt heraus. Der vorhandene zeitliche Track wird erstmals bis in die Bildkomposition durchgereicht, statt auf ein festes Rechteck reduziert zu werden.

**Architektur:** Identitätsgesicherter Track → offline geglätteter Kamerapfad → dynamischer 720×720-Preclip → pro Frame transformierte Provider-Boxen → Verifikation am echten MP4 → Sync 3 → Motion Verdict

---

## Reihenfolge bewusst konservativ

Full-Plate als Primärpfad ist bei uns zweimal zurückgerollt worden: `v152/v153` wegen Animorph-Artefakten auf Nachbargesichtern (dokumentiert in `v163`), `v203` wegen `generation_input_face_selection_invalid` bei Multi-Face-Plates (dokumentiert in `v204`). Daher: **N ≥ 2 → Preclip bleibt verbindlich. N = 1 → Full-Plate nur nach Benchmark.**

---

## Schritt 1 — Track verdichten (`_shared/face-track.ts`)

Heute max. 6 Stützstellen pro Turn.

**Umgebungsbeschränkung:** Ein dichter lokaler Tracker (optischer Fluss, KLT, CSRT) ist im Edge-Runtime nicht lauffähig — es gibt kein OpenCV, und Frame-Extraktion läuft per Projektregel `v347` ausschließlich über AWS-Stills mit je einem Lambda-Roundtrip. `face-detect-mediapipe.ts` ist trotz Namen ein AWS-Rekognition-Adapter, kein lokaler Tracker.

Realistische Umsetzung:
- **Risikobasierte Verdichtung** statt gleichmäßig mehr Samples: zusätzliche Stills genau dort, wo die Box zwischen zwei Ankern stark wandert, wo sie sich dem Ausschnittsrand nähert, und an Turn-Anfang/-Ende.
- **Rest-Unsicherheit durch Padding absorbieren**: der Sicherheitsrand wird aus der gemessenen Bewegungsgeschwindigkeit zwischen den Ankern abgeleitet, nicht fest gesetzt. Schnelle Bewegung → größerer Rand.
- AWS Rekognition bleibt Identitätsautorität; Zuordnung gegen die bestehende Face Collection (`v349`).
- **Kein Interpolieren über Identitätslücken** — bei Abriss ehrlich `null`.
- Ausgabe: Box pro Frame plus Metriken je Frame (Gesicht erkannt, Mundregion sichtbar, Konfidenz, längste Lücke).

*Folgeschritt (nicht Teil von v359):* echtes dichtes Tracking in den Remotion-Lambda-Render verlagern — dort liegen die dekodierten Frames bereits vor.

## Schritt 2 — Offline-Kamerapfad (neu: `_shared/camera-path.ts`)

Wir rendern offline und kennen den gesamten Track im Voraus — der Planer muss daher nicht kausal arbeiten.

- **Bidirektionale Glättung**: Ausreißer entfernen, vorwärts glätten, rückwärts glätten. Kein reiner EMA-Filter, der bei schneller Bewegung hinterherläuft.
- **Look-ahead** von ~5–10 Frames: droht Randkontakt, zieht die Kamera vorausschauend mit, statt erst nach dem Anschneiden zu reagieren.
- **Dead Zone**: solange die Box im inneren Sicherheitsbereich liegt, bewegt sich nichts.
- **Bewegungsgrenzen**: maximale Pan-Geschwindigkeit und maximale Beschleunigung pro Frame; keine Korrektur bei Mikrobewegungen.
- **Weiche Reacquisition**: nach einer Track-Lücke nie ein Ein-Frame-Sprung — entweder über mehrere Frames anfahren, oder den Turn ablehnen.
- **Zoom konstant** über den Turn. Die Crop-Größe wird **sprachgewichtet** bestimmt: Frames mit tatsächlicher Sprachaktivität zählen am stärksten, Lead-in und Tail schwächer. Ein Frame ohne Ton darf abweichen, ein Frame mit Silbenbeginn nicht.

## Schritt 3 — Bewegter Preclip

`DialogTurnFaceCropVideo` erhält den Pfad statt eines festen Rechtecks und verschiebt den Ausschnitt pro Frame. Der `v358`-Vertrag bleibt: Ausgabe zwingend 720×720, Maße vor Dispatch per `probeMp4Dims` verifiziert. Erfordert Remotion-Bundle-Deploy.

## Schritt 4 — Provider-Boxen pro Frame transformieren

Jede Box wird gegen die **an diesem Frame gültige** Crop-Position gerechnet. Validierung pro Frame, nicht nur für einen Referenzframe:

- Box vollständig in 0..720, Fläche > 0, Mindestbreite und Mindesthöhe eingehalten
- keine NaN/Infinity, Frameindex monoton, kein sprunghaftes Implodieren, plausibles Seitenverhältnis
- **Kontext-Padding**: nicht die enge Gesichtsbox senden, sondern Kiefer und unteren Gesichtsbereich einschließen — Sync 3 arbeitet nachweislich mit Umfeld besser

## Schritt 5 — Verifikation am tatsächlich gerenderten MP4

Zwei getrennte Prüfungsarten:

**Geometrisch, für jeden Frame** (billig, da mathematisch): Face-Box im Crop, Mund-ROI im Crop, Padding eingehalten.

**Visuell, risikobasiert statt gleichmäßig**: Stills genau an den kritischen Stellen — Anfang, Ende, maximale Track-Geschwindigkeit, minimale Randdistanz, nach Lücken, nach Reacquisition, größte Beschleunigung. Geprüft wird: Gesicht detektierbar, Identität korrekt, Mundregion vorhanden, keine schwarzen Frames, Maße korrekt.

### Drei Hard Stops sofort scharf

Das sind keine Qualitätsschwellen, sondern mathematische bzw. semantische Fehler — sie werden nicht kostenpflichtig dispatcht:

1. Anzahl Box-Einträge ≠ dekodierte Framezahl
2. Provider-Box außerhalb des tatsächlichen 720×720-Raums
3. Gesicht bzw. Mund während des gesamten Audio-Kernfensters nie sichtbar

### Alles Übrige zunächst nur Telemetrie

Face-Detection-Ratio, Mouth-Visible-Ratio, native Gesichtshöhe, längste Lücke, Crop-Geschwindigkeit, Crop-Beschleunigung, Provider-Warnungen, Output-vs-Input-Delta.

Grund: harte empirische Schwellen sofort scharf zu schalten hat von v344 bis v355 wiederholt legitime Szenen blockiert. Erst Daten, dann Schwellen.

## Schritt 6 — Kontrollierter Benchmark

Identische Person, identisches Audio, identische Länge; variiert werden nur Gesichtsgröße, Bewegung und Crop-Strategie.

| Fall | Gesicht | Bewegung | Pfad |
|---|---|---|---|
| A | groß | statisch | Full-Plate |
| B | groß | leicht | Full-Plate |
| C | groß | stark | dynamischer Crop |
| D | mittel | statisch | dynamischer Crop |
| E | mittel | stark | dynamischer Crop |
| F | klein | statisch | dynamischer Crop |
| G | groß | stark | dynamischer Crop (trennt Bewegung von Größe) |
| H | mittel | leicht | **statischer** Crop (Referenz gegen den alten Pfad) |

Drei Vergleichspaare müssen sauber isoliert sein: statisch vs. dynamisch bei identischem Input, Full-Plate vs. dynamischer Crop, dynamischer Crop mit und ohne Per-Frame-Boxen. Fall H ist der eigentliche kausale Nachweis.

## Schritt 7 — Route A nur für N = 1, nur nach Benchmark

Zeigen A und B saubere Ergebnisse, entfällt der Preclip für Einzelsprecher mit ausreichend großem Gesicht. Für Multi-Speaker bleibt er verbindlich, bis der Benchmark die `v163`/`v204`-Befunde widerlegt.

---

## Abnahmekriterien

Müssen bestehen:
1. Kailee-Repro: Gesicht bleibt während des gesamten Sprachkerns im gerenderten Crop
2. Box-Anzahl = dekodierte Framezahl
3. Jede Box im Koordinatenraum des tatsächlichen Preclips
4. Kein statischer Crop bei bewegtem Track
5. Keine Ein-Frame-Sprünge über der definierten Grenze
6. Motion Verdict für die Kailee-Szene: `moved`, nicht `passthrough`
7. Keine Regression bei mindestens drei bisher erfolgreichen Szenen
8. Identitätszuordnung über alle Pässe unverändert

## Bekanntes Restrisiko

Der dynamische Crop kann eine neue Fehlerklasse erzeugen: gleitender Hintergrund, künstlich festgenagelter Kopf, nicht zur virtuellen Kamerabewegung passender Bewegungsunschärfe-Eindruck. Dead Zone, Geschwindigkeits- und Beschleunigungsgrenzen sowie weiche Reacquisition adressieren das; Fall C und G im Benchmark prüfen es explizit.

Ist das Gesicht im Plate nativ zu klein, hilft auch ein perfekt folgender Ausschnitt begrenzt — dann muss der Dialog-Director eine engere Einstellung neu inszenieren. Dieser Fall bleibt bestehen, wird durch Schritt 5 aber sichtbar statt still zu scheitern.

## Technische Details

- `supabase/functions/_shared/face-track.ts` — risikobasierte Verdichtung, Per-Frame-Metriken, bewegungsabgeleitetes Padding, kein Interpolieren über Identitätslücken
- `supabase/functions/_shared/camera-path.ts` — neu: bidirektionale Glättung, Look-ahead, Dead Zone, Bewegungsgrenzen, sprachgewichteter Zoom
- `supabase/functions/_shared/pass-face-preclip.ts` — Pfad statt Rechteck durchreichen
- Remotion-Komposition `DialogTurnFaceCropVideo` — bewegter Ausschnitt, Bundle-Deploy nötig
- `supabase/functions/compose-dialog-segments/index.ts` — Box-Transformation pro Frame, Hard Stops, Telemetrie, Routing
- Tests: Kamerapfad (Glättung, Grenzen, Reacquisition), Box-Transformation, Frameanzahl-Gleichheit, Kailee-Regressionsfall

Unverändert: `v349` Cast Identity Lock, `v358` Dimensionsvertrag und Pass-Slot-Schutz, `v356` Ergebnis-Gate in `mouth-motion-verdict.ts`, Slot-Leasing und Watchdog, Credit-Erstattungslogik, AWS-only-Regel aus `v347`.

Versionsmarker: `v359-temporal-crop`.
