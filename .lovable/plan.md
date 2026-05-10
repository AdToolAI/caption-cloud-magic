Ich habe den Fehler eingegrenzt: Der Klick setzt den UI-Status kurz auf `generating`, aber direkt danach wird er wieder mit einem älteren Szenen-Snapshot überschrieben. Zusätzlich gibt es in deinem Snapshot keinen `compose-video-clips` Netzwerkaufruf, d. h. der Backend-Render wird wahrscheinlich gar nicht zuverlässig erreicht.

Plan:

1. Cinematic-Sync nicht mehr über die normale `ensureProject()`-Persistenz starten
   - Diese Persistenz schreibt die komplette alte `project.scenes`-Liste zurück und kann den gerade gesetzten `engineOverride`, `clipSource`, `clipStatus` wieder entfernen.
   - Stattdessen wird beim Button-Klick die bestehende Scene-ID direkt verwendet und nur diese eine Szene aktualisiert.

2. Lokalen UI-Status gegen Debounce-Rollback schützen
   - Vor dem Start wird die Szene lokal auf `engineOverride: cinematic-sync`, `clipSource: ai-hailuo`, `clipStatus: generating`, `lipSyncStatus: pending` gesetzt.
   - Der automatische debounced Scene-Speicher darf diesen Startzustand nicht mit einer alten Version überschreiben.

3. Persistenz nur für die Ziel-Szene schreiben
   - `composer_scenes` wird nur für die angeklickte Szene aktualisiert.
   - Keine komplette Projekt-/Scene-Neuspeicherung im Startpfad.

4. Backend-Aufruf garantiert auslösen
   - Danach wird `compose-video-clips` direkt mit genau dieser Szene und explizit `engineOverride: cinematic-sync` aufgerufen.
   - Falls kein persistiertes Projekt/keine gültige Scene-ID vorhanden ist, wird zuerst sauber gespeichert und anschließend die neu gemappte Szene verwendet.

5. Fehler sichtbar machen statt still zurückzuspringen
   - Wenn der Backend-Aufruf scheitert, bleibt eine klare Fehlermeldung/Toast sichtbar.
   - Der UI-Status wird nur dann zurückgesetzt, wenn wirklich ein Fehler kommt, nicht durch normale Zwischen-Polls.

6. Polling-Fix für Phase 1 und Phase 2
   - Polling läuft weiter solange `clipStatus === generating` oder `engineOverride === cinematic-sync` mit `lipSyncStatus pending/running` existiert.
   - Wenn Hailuo fertig ist, startet/überwacht die Lip-Sync-Phase weiter, statt die Szene als „fertig aber unverändert“ stehen zu lassen.

Erwartetes Ergebnis:
- Nach Klick auf „In echte Szene einbauen“ bleibt sofort sichtbar „Echte Szene wird gerendert“ stehen.
- Im Netzwerk erscheint ein `compose-video-clips` Call.
- Die Szene springt nicht mehr zurück auf den alten HeyGen-Fertigzustand.
- Nach Hailuo folgt Sync.so automatisch, und bei längerer LipSync-Dauer wird die Szene weiterhin auf die passende Hailuo-Dauer angepasst.