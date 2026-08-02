## Warum die Messwerte von vornherein so niedrig sind

Die Zahl, an der alles hängt (`outVsIn` = 1.4–1.9), ist nicht „schlechtes Provider-Verhalten in Zahlen", sondern das Ergebnis von vier Verdünnungsschritten in unserer eigenen Messung. Jeder einzelne drückt das Nutzsignal, während das Rauschen konstant bleibt.

**1. Das Messfenster liegt gar nicht auf dem Mund.**
Auf allen vier Passes des letzten Laufs sind `mouth_center` und `mouth_rect` leer — die Preclip-Stufe berechnet den Mundanker, schreibt ihn aber nicht auf den Pass. Gemessen wird deshalb immer ein festes Standardrechteck (x 0.24 / y 0.52 / Breite 0.52 / Höhe 0.36 des Bildes). Das ist über ein Drittel des Bildes: Mund, Kinn, Wangen, Hals, Hintergrund. Der Mund selbst macht darin grob 10–15 % der Fläche aus.

**2. Es wird gemittelt, nicht gemessen.**
Das Band wird auf ein 48×32-Raster heruntergerechnet und dann der **Mittelwert** der Helligkeitsdifferenz über alle 1536 Zellen gebildet. Eine echte Lippenbewegung verändert vielleicht 100 dieser Zellen stark (Differenz 30–60), die übrigen 1400 gar nicht. Der Mittelwert davon liegt bei ~2–4. Genau in diesem Bereich liegen unsere Messwerte — sie beweisen also nicht, dass nichts passiert ist; sie können ein echtes Signal gar nicht sichtbar machen.

**3. Es fehlt ein Nullpunkt.**
Jede H.264-Neukodierung erzeugt für sich schon 1–2 Punkte Differenz. Wir vergleichen unsere Messwerte aber gegen eine feste Zahl (1.8) statt gegen dieses Grundrauschen im selben Bild. Damit ist die Messung nicht kalibriert: Ein dunkler Clip, ein anderer Encoder oder eine andere Bitrate verschieben das Ergebnis, ohne dass sich am Lip-Sync irgendetwas geändert hätte.

**4. Zu wenige Stichproben.**
Vier Frames über einen 2,8-Sekunden-Turn. `Math.max` über drei Differenzen ist statistisch nahezu bedeutungslos — Pass 1 und Pass 2 unterschieden sich am Ende um 0.15 Punkte, und das entschied über „fertig" gegen „Szene fehlgeschlagen".

**Fazit:** Die Werte sind nicht schlecht, weil der Provider schlecht arbeitet, sondern weil die Messung ein starkes lokales Signal in einer großen, überwiegend unbeteiligten Fläche ertränkt. Und parallel dazu gibt es das echte Problem: die ASD-Box, die wir Sync 3 mitschicken, liegt nachweislich in der linken unteren Bildecke (`[0, 266, 373, 720]` im mundzentrierten 720×720-Preclip, an zwei Rändern angeschlagen) — dort ist kein Gesicht.

## Ja, die Messwerte lassen sich strukturell hochziehen

Ziel ist ein Signal-Rausch-Abstand, bei dem echtes Lip-Sync **um ein Vielfaches** über dem Encoder-Rauschen liegt statt um 0.15 Punkte darunter. Vier Hebel, alle ohne neue Provider-Kosten:

- **Fenster verkleinern und richtig setzen.** Mundanker am Pass festschreiben und nur die Lippenregion vermessen statt das halbe Bild. Erwarteter Signalgewinn: Faktor 3–5, allein durch Wegfall der unbeteiligten Fläche.
- **Vom Mittelwert auf Perzentil wechseln.** Nicht „wie stark hat sich das Band im Schnitt verändert", sondern „wie stark haben sich die am stärksten veränderten 10 % der Zellen verändert". Das ist die Größe, die Lippenbewegung tatsächlich erzeugt. Erwarteter Gewinn: nochmals Faktor 5–10.
- **Kontrollband als Nullpunkt.** Dieselbe Messung auf einer Region, die sich bei Lip-Sync nicht ändern darf (Stirn/oberer Gesichtsbereich). Bewertet wird das Verhältnis Mund zu Kontrolle. Damit wird die Messung encoder-, helligkeits- und bitratenunabhängig — der Nullpunkt kommt aus demselben Bild.
- **Auflösung und Stichprobenzahl anheben.** Feineres Raster in der Lippenregion und mindestens acht Stichproben über das Sprachfenster, verteilt auf die lautesten Audioabschnitte statt gleichmäßig (dort ist Mundbewegung garantiert vorhanden, falls überhaupt welche existiert).

Zusammen verschiebt das die Trennschärfe von „1.74 gegen 1.89" auf Größenordnungen — echte Animation landet dann bei einem Mund-zu-Kontroll-Verhältnis deutlich über 2, ein Passthrough bei ~1. Erst dann ist die Aussage „unverändert zurückgegeben" ein Beweis und keine Vermutung.

**Wichtig zur Erwartung:** Bessere Messung beseitigt die *Fehlurteile*. Sie beseitigt nicht das dahinterliegende Problem, dass Sync 3 auf eine Box neben dem Gesicht schaut. Beides gehört in denselben Umbau, in dieser Reihenfolge.

---

## Vorgehen: Beweis zuerst, Umbau danach

**Schritt 1 — Geometrie-Beweis am realen Fall (kein Produktionscode).**
Frames des versendeten Preclips ziehen, die ausgelieferten ASD-Boxen darauflegen. Ergebnis ist ein Bildbeleg für eine von zwei Aussagen: Box liegt neben dem Gesicht (unsere Geometrie ist die Ursache) oder Box sitzt korrekt (dann ist der Provider die Ursache).

**Schritt 2 — Messung kalibrieren, bevor sie irgendetwas entscheidet.**
Die neue Messgröße (Perzentil im Mundband gegen Kontrollband) wird an drei bekannten Fällen geeicht: ein nachweislich animierter Clip, eine reine Neukodierung desselben Clips, ein echter Passthrough. Erst wenn die drei Fälle sauber auseinanderliegen, darf die Größe über Szenen entscheiden.

**Schritt 3 — A/B gegen Sync.so.** Derselbe Preclip, dieselbe Audiospur, zwei Jobs: einmal mit unserer Box, einmal mit `auto_detect`. Die geeichte Messung entscheidet objektiv, welcher Weg animiert.

**Schritt 4 — Umbau nach vier Prinzipien**, im Umfang, den Schritt 1–3 belegen:
1. Die ASD-Entscheidung richtet sich nach dem Inhalt des *versendeten* Clips, nicht nach der Sprecherzahl der Szene. Einsprecher-Preclip = ein Gesicht = `auto_detect`.
2. Eine ASD-Box geht nur raus, wenn sie vorher am echten Frame verifiziert wurde. Nicht bestanden = fallenlassen, nicht blind mitschicken.
3. Die Messung misst, was sie behauptet: Mundgeometrie am Pass, Perzentil statt Mittelwert, Kontrollband als Nullpunkt.
4. Zweifel trifft nie den Kunden: terminal sind nur harte Signale und ein eindeutiges Verhältnis; alles dazwischen ist Telemetrie. Ein Hard-Fail bricht laufende Geschwisterpasses sauber ab.

**Schritt 5 — Rückrechnung und Regressionstests.** Alle gespeicherten Verdikt-Datensätze gegen die neue Bewertung nachrechnen (kein hartes Fehlurteil auf bekannt guten Passes), Unit-Tests für Boxprüfung, Mundband, Kontrollband und Entscheidungslogik, Abschluss mit einem realen Vier-Sprecher-Lauf.

## Technische Berührungspunkte

- `supabase/functions/_shared/mouth-motion-verdict.ts` — Perzentil-Metrik, Kontrollband, Verhältnis-Kriterium, feineres Raster, ≥8 audio-gewichtete Stichproben; absolute Schwellen (1.8 / 2.0 / 1.5) entfallen als Entscheidungsgrößen.
- `supabase/functions/_shared/pass-face-preclip.ts` — `mouth_center` / `mouth_rect` am Pass persistieren.
- `supabase/functions/_shared/asd-strategy.ts` — Entscheidungsgrundlage auf die Gesichtszahl im dispatched Clip umstellen.
- `supabase/functions/compose-dialog-segments/index.ts` — Vorab-Verifikation der Dispatch-Box, Verwerfen statt Mitschicken, Geschwister-Abbruch bei Hard-Fail.
- Kein Schemawechsel; neue Felder leben in `dialog_shots.passes[]`.
