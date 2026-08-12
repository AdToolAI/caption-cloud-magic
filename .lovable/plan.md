# Seedance 2.5: Native Audio und Sprachauswahl korrigieren

## Bestätigter Ist-Zustand

- Auf **useadtool.ai** läuft noch ein älterer Frontend-Bundle, der Seedance intern als `seedance: []` führt. Deshalb erscheint dort selbst bei **English** die falsche Warnung „Sprache nicht unterstützt“.
- In der aktuellen Vorschau ist Seedance bereits für DE/EN/ES freigegeben; dort erscheint die Warnung nicht mehr.
- Die ModelArk-API bietet für Seedance 2.5 `generate_audio`, aber kein separates Sprachfeld. Die Dialogsprache wird über den Text-Prompt gesteuert.
- Bei **Deutsch** sendet die aktuelle Vorschau `generate_audio: true` und ergänzt den Prompt um eine verbindliche deutsche Sprachvorgabe. Deutsch wird also bereits versucht, ist aber nicht durch einen API-Sprachparameter technisch erzwungen.
- Die UI beschränkt die Auswahl unnötig auf Auto, Deutsch, Englisch und Spanisch, obwohl die API selbst keine solche feste Dreierliste vorgibt.

## Umsetzung

1. **Seedance aus der TTS-Sperrlogik lösen**
   - Native Audio und gewünschte Dialogsprache für Seedance unabhängig von den festen Sprachlisten anderer Provider behandeln.
   - Für Seedance niemals mehr die falsche „kein Voiceover“-Warnung aufgrund einer lokalen Allowlist anzeigen.
   - `suppressDialogue` nur verwenden, wenn der Nutzer ausdrücklich Sprache ausschließt, nicht weil eine Sprache außerhalb DE/EN/ES gewählt wurde.

2. **Seedance-Sprachauswahl erweitern**
   - Für Seedance eine umfangreiche, klar benannte Auswahl gebräuchlicher Dialogsprachen anbieten, unter anderem Deutsch, Englisch, Spanisch, Französisch, Italienisch, Portugiesisch, Niederländisch, Polnisch, Türkisch, Arabisch, Hindi, Japanisch, Koreanisch und Chinesisch.
   - „Auto“ weiterhin an der UI-Sprache ausrichten.
   - Intern stabile Sprachcodes verwenden und daraus eine eindeutige englische Prompt-Anweisung erzeugen; visuelle Prompts bleiben gemäß Plattformregel Englisch.

3. **Ehrliche UI-Kommunikation**
   - Den bisherigen Sperrhinweis bei Seedance entfernen.
   - Stattdessen knapp erklären: Seedance erzeugt natives Audio inklusive Dialog; Sprache und Wortlaut werden über den Prompt gesteuert, Aussprache und Lippenbewegung können modellbedingt variieren.
   - DE/EN/ES vollständig lokalisiert halten, ohne Sprachmischungen.

4. **Request-Vertrag vereinheitlichen**
   - Die ausgewählte Dialogsprache im Client eindeutig in den finalen Prompt einbauen.
   - Die Seedance-Funktion weiterhin nur mit den offiziell dokumentierten Feldern aufrufen (`generate_audio`, Prompt usw.); kein erfundenes Provider-`language`-Feld senden.
   - Veraltete Kommentare entfernen, die Seedance fälschlich als „Ambience/Foley only“ oder ohne zuverlässige Sprache beschreiben.

5. **Regressionstests und Live-Abgleich**
   - UI-/Payload-Tests für Englisch, Deutsch, Spanisch und mindestens eine zusätzliche Sprache ergänzen.
   - Prüfen: Audio bleibt aktiv, kein falscher Warnhinweis, kein `suppressDialogue`, korrekte Sprachdirektive im Prompt.
   - Die aktuelle Vorschau im Browser gegen Seedance 2.5 testen.
   - Danach den Unterschied zur veröffentlichten Domain dokumentieren; **useadtool.ai benötigt anschließend eine neue Veröffentlichung**, damit der alte Bundle-Code ersetzt wird.

## Technische Leitentscheidung

Seedance 2.5 wird als **prompt-gesteuertes natives Audiomodell** behandelt. Die App darf zusätzliche Sprachen auswählbar machen, behauptet aber nicht, dass ByteDance jede Sprache per API garantiert. Dadurch funktioniert Deutsch an dieser Stelle korrekt als klare Prompt-Vorgabe, ohne künstliche Sperre oder falsches Versprechen.
