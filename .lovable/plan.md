# Plan v367 — Beweis zuerst: Wer bekommt welches Overlay?

## Ehrlicher Stand

Meine bisherige Erklärung (Restbewegung, Player-Verwechslung) deckt deine Beobachtung nicht ab. Wenn alle vier deutschen Dialoge exakt taktgenau auf Sarahs Mund liegen, muss entweder das Zurückkleben oder die Sprecherzuordnung kollabieren. **Diese Ursache ist derzeit nicht bewiesen** — deshalb wird sie zuerst gemessen, bevor irgendetwas umgebaut wird.

## Verifizierte Fakten aus dem letzten Lauf

- Vier getrennte Sync.so-Pässe mit vier deutschen Audiodateien und vier korrekten Zeitfenstern (0–1.16, 1.41–2.94, 3.19–4.96, 5.21–7.81).
- Vier unterschiedliche Rückklebe-Rechtecke, also keine offensichtlich identischen Koordinaten.
- Die HappyHorse-Rohplatte besitzt eine eigene Audiospur — sie erklärt Sarahs englischen Fremdtext, aber nicht die deutschen Dialoge.

## Der gefundene Widerspruch

Die Szene speichert **zwei sich widersprechende Gesichts-zu-Charakter-Zuordnungen**:

```text
Zuordnung A (Geometrie-Lock)   Zuordnung B (Vision-FaceMap)
Platz 0 -> Samuel              Platz 0 -> Matthew
Platz 1 -> Matthew             Platz 1 -> Kailee
Platz 2 -> Sarah               Platz 2 -> Samuel
Platz 3 -> Kailee              Platz 3 -> Sarah
```

Keine der beiden ist als verbindlich markiert. Welche Zuordnung greift, hängt davon ab, welcher Schritt sie zuerst liest. Genau hier kann die Zuordnung von Sprecher zu Gesicht kippen. Ob dieser Widerspruch tatsächlich die Ursache ist, muss der Nachweis unten zeigen.

## 1. Nachweis (zuerst, ohne Umbau)

- Aus jedem der vier gelieferten Sync.so-Ergebnisse Standbilder im jeweils zugehörigen Dialogfenster ziehen und feststellen, welche Person darin den Mund bewegt.
- Aus dem finalen Video zu denselben Zeitpunkten Standbilder ziehen und feststellen, an welcher Bildposition Bewegung liegt.
- Ergebnis ist eindeutig einer von drei Fällen:
  - **A**: Bereits die vier Provider-Ergebnisse zeigen viermal Sarah → Fehler in der Zuschnitt-Erstellung.
  - **B**: Die Provider-Ergebnisse zeigen vier verschiedene Personen, das Finale nur Sarah → Fehler beim Zurückkleben.
  - **C**: Beides korrekt → Fehler in der Auslieferung des angezeigten Videos.
- Dieser Nachweis ist rein intern und erzeugt keine Kundenassets.

## 2. Fix je nach Befund

- **Fall A**: Eine einzige verbindliche Gesichtszuordnung festlegen. Der Geometrie-Lock wird alleinige Wahrheit, die zweite Zuordnung wird nur noch als Hinweis geführt und darf keinen Zuschnitt mehr bestimmen. Vor dem Versand wird geprüft, dass jeder Sprecher genau ein eigenes Gesicht bekommt.
- **Fall B**: Das Zurückkleben wird strikt an denselben Zuschnitt gebunden, mit dem der Sprecher ausgeschnitten wurde. Überlappen sich zwei Zielbereiche oder fehlt einer, bricht der Zusammenbau ab statt ein falsches Ergebnis zu erzeugen.
- **Fall C**: Endgültiges Video wird zur einzigen sichtbaren Szenenversion; Rohplatten und Zwischenstände verschwinden aus der Mediathek.

## 3. Unabhängig davon sofort mit umgesetzt

- Dialogplatten werden bei HappyHorse ohne Provider-Audio erzeugt und vor dem Lip-Sync tonlos gemacht, damit nie wieder eine fremde englische Stimme im Material liegt.
- Interne Zwischenstände (Rohplatte, Einzelzuschnitte, Einzelpässe) erscheinen nicht mehr in der Mediathek; nur das fertige Szenenvideo ist sichtbar.
- Die bereits sichtbaren Doppel- und Vorgängerversionen dieser Szene werden bereinigt.

## 4. Abnahme

Neue Vier-Sprecher-Testszene. Für jedes der vier Dialogfenster wird nachgewiesen, dass genau die vorgesehene Person den Mund bewegt. Kein englischer Ton. Nach Neuladen genau ein Szenenvideo in der Mediathek.

## Technischer Hinweis

Keine Änderung an Sync.so-Parametern, Preisen oder Rückerstattungslogik. Der Umbau beschränkt sich auf Zuordnung, Zusammenbau und Sichtbarkeit von Assets.