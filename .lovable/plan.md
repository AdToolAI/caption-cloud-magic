## Meine Bewertung: der Kern stimmt, drei Punkte sind bereits erledigt

Ich habe deinen Vorschlag gegen den echten Code geprüft. Das Ergebnis ist gut für uns – ein Teil dessen, was du forderst, ist schon gebaut. Der wertvolle Teil deines Vorschlags ist genau der, den wir noch nicht haben.

**Was du vorschlägst, aber bereits existiert:**

- **Keine serielle Kette.** Der Kopfkommentar in der Datei behauptet zwar noch eine Kette („pass N's video input = pass N-1's output"), der Code macht aber längst das, was du forderst: jeder Sprecher wird aus dem **unveränderten Original-Plate** abgeleitet, und bis zu vier Passes laufen **parallel**. Generationen-Akkumulation gibt es also nicht. Der Kommentar ist veraltet und irreführend – der muss weg.
- **Turn-Extraktion existiert.** Jeder Pass rendert bereits nur sein eigenes Sprech-Fenster, nicht den ganzen Clip.
- **Timeline-Assembly ist bereits Overlay am Originalort.** Wir verketten nichts, wir legen den lipgesyncten Ausschnitt an seiner absoluten Originalzeit zurück auf die Master-Plate.

**Wo du absolut ins Schwarze triffst – und das ist die eigentliche Ursache:**

1. **Unsere „per-frame Bounding Boxes" sind gar keine.** Wir laden zwar eine `bounding_boxes_url` hoch, füllen sie aber mit **immer derselben Box**, nur an- und ausgeschaltet nach Sprechfenster. Es gibt kein echtes Frame-zu-Frame-Tracking. Bewegt sich die Figur, zeigt unsere Box ins Leere – und Sync 3 findet nichts zum Animieren. Genau das ist der Fall, den wir seit Wochen als „Passthrough" sehen.
2. **Der Anchor-Check ist zahnlos.** Es gibt ihn, aber er ist rein beratend (Ratio, 12 %) und blockiert nichts. Der harte Pixel-Check greift erst auf der fertig gerenderten Plate – also nachdem das Video schon bezahlt ist.
3. **Es fehlt jede Umregie.** Wir haben nur „geht" oder „Fehlermeldung". Kein Punch-in, keine Coverage.

**Wo ich dir widerspreche:** Der Zielwert von 220 px darf kein neuer Blocker werden. Genau daran sind v344 bis v355 gescheitert. Er wird eine **Regie-Entscheidung** (welcher Modus), niemals ein Abbruchgrund.

## Umsetzung — Dialog Director

**Schritt 1 — Echtes Gesichts-Tracking pro Frame**
Der größte Hebel und die wahrscheinlichste Ursache der Fehlschläge. Statt einer wiederholten Standbox wird die Gesichtsposition über die Frames des Turns tatsächlich verfolgt, leicht geglättet und als echte Bewegungsspur an Sync geschickt. Der Kontextrahmen wird großzügiger (rund ein Viertel Aufschlag nach oben, zur Seite und unter das Kinn), weil Sync 3 mit Umfeld besser arbeitet als mit engem Mundausschnitt. Der „alle Frames dieselbe Box"-Notpfad wird entfernt.

**Schritt 2 — Anchor-Dialogvertrag mit Regie-Entscheidung (kein Blocker)**
Direkt nach dem Anchor-Bild, also **bevor Videokosten entstehen**, werden Anzahl der Gesichter, Identitätszuordnung, native Gesichtsgröße, Mundsichtbarkeit und Schärfe geprüft. Ergebnis ist immer eine Entscheidung, nie ein Abbruch:

```text
alle Gesichter groß      → Modus A  Gruppen-Dialogshot (wie bisher)
grenzwertig              → Modus B  automatischer Punch-in auf den Sprecher
zu klein                 → Modus C  Coverage: Totale + engere Zweier-Shots
Anchor unbrauchbar       → Anchor neu, max. 2 Versuche, dann Modus C
```

**Schritt 3 — Modus B: Automatischer Punch-in**
Während ein Sprecher spricht, fährt das Bild digital näher an ihn heran, danach zurück auf die Gruppe. Damit steigt die Gesichtsgröße im verarbeiteten Bild deutlich, ohne dass das Videomodell etwas anders rendern muss. Wirkt wie normale Bildregie, kein Notbehelf.

**Schritt 4 — Modus C: Coverage**
Statt einer unbrauchbaren Vierer-Totale werden mehrere Einstellungen erzeugt: kurze Gruppen-Totale zum Etablieren, dann engere Aufnahmen für die Dialogzeilen, Abschluss auf der Gruppe. Der Kunde bekommt weiterhin „vier Sprecher in einer Szene", der Dialog wird aber in technisch sicheren Einstellungen produziert. Die Figuren bleiben über die bestehende Charakter-Bindung identisch.

**Schritt 5 — Handles an den Turn-Grenzen**
Jeder Turn wird mit rund 200 ms Vor- und Nachlauf verarbeitet, eingesetzt wird nur der Kern. Dazu ein sehr kurzer Bildübergang. Damit verschwinden sichtbare Sprünge zwischen den Sprecherabschnitten.

**Schritt 6 — Aufräumen und Klarstellen**
Der irreführende „serielle Kette"-Kommentar wird korrigiert. Das Hochskalieren auf 720p bleibt, wird aber ausdrücklich als reine Formatanpassung markiert und nicht länger als Qualitätsmaßnahme behandelt.

**Was unangetastet bleibt:** Charakter-Identitätssperre, Slot-Leasing, Vorabprüfung von Audio und Dateien, Bewegungs-Verdikt nach dem Lauf, Passthrough-Erkennung, automatische Rückerstattungen, Watchdog und Telemetrie. Alles davon passt zur neuen Architektur.

**Regressionstests:** Bewegte Figur erzeugt eine sich bewegende Boxspur, keine Standbox. Ein Anchor mit vier kleinen Gesichtern landet in Modus C statt in einem Fehlschlag. Ein Anchor mit großen Gesichtern läuft unverändert in Modus A und kostet nichts extra.

## Reihenfolge

Ich würde mit **Schritt 1 allein** starten und einen Testlauf machen. Wenn die Standbox tatsächlich die Ursache war, sehen wir das sofort am Bewegungs-Verdikt – und die Regie-Modi werden dann zur Absicherung der Randfälle, statt zur Rettung des Normalfalls.