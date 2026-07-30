## Plan v301 — Strikter Sprachfilter der Voice-Bibliothek

### Bestätigte Ursache
Die Oberfläche sendet `de` korrekt an `list-voices`. Die Backend-Abfrage filtert aktuell jedoch über `supported_languages enthält de` statt über die eigentliche Hauptsprache der Stimme. Dadurch erscheinen mehrsprachige englische, spanische oder indische Stimmen, sobald sie Deutsch technisch unterstützen. Die Daten bestätigen genau dieses Verhalten: Unter dem deutschen Filter befinden sich Datensätze mit `language = en/es/fr/...` und lediglich `de` in `supported_languages`.

### Umsetzung
1. **Backend-Filter korrigieren**
   - Bei einer gewählten Sprache ausschließlich `voice_library_cache.language = ausgewählte Sprache` zulassen.
   - `supported_languages` weiterhin als technische Information behalten, aber nicht mehr zur Auswahl der Bibliotheksstimmen verwenden.
   - `nativeOnly` nur innerhalb der bereits korrekt gewählten Hauptsprache anwenden.

2. **Frontend gegen Fremdsprachen absichern**
   - Bibliotheks-, eigene und zuletzt verwendete Stimmen vor der Anzeige nochmals gegen die aktive Sprache prüfen.
   - Fremdsprachige „Zuletzt verwendet“-Einträge bei aktivem Sprachfilter ausblenden, damit sie den Filter nicht umgehen können.
   - Beim Wechsel der Sprache bereits geladene Ergebnisse nicht weiter anzeigen; der Query-Key lädt den passenden Datensatz neu.

3. **Regressionstests und Live-Prüfung**
   - Die Backend-Funktion mit Deutsch testen und verifizieren, dass jede zurückgegebene Stimme `language = de` besitzt.
   - Zusätzlich Englisch und eine weitere Sprache prüfen.
   - Im Voice-Dialog testen, dass Sprache, Karten, Vorschau und Auswahl konsistent bleiben und bei „Alle Sprachen“ weiterhin der vollständige Katalog erscheint.