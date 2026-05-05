Ich habe die Ursache gefunden: Die 500er-Regel läuft aktuell nur beim manuellen Upload in der Mediathek. KI-/Render-Videos aus `video_creations` werden von vielen Generatoren direkt im Backend gespeichert und umgehen diese Client-Logik komplett. Deshalb stehen bei dir jetzt 545/500 Videos. Zusätzlich blockiert die aktuelle Upload-Logik bei verbundener Cloud eher, statt wirklich konsequent das älteste lokale Video zu löschen.

Plan zur Reparatur:

1. Zentrale Backend-Cleanup-Regel einführen
   - Eine Datenbankfunktion erstellt die verbindliche Regel: Pro Nutzer dürfen maximal 500 abgeschlossene Mediathek-Videos sichtbar bleiben.
   - Sobald mehr als 500 vorhanden sind, werden genau die ältesten Videos gelöscht: `ORDER BY created_at ASC, id ASC`.
   - Demo-/geschützte Einträge bleiben ausgenommen.

2. KI- und Render-Videos automatisch abfangen
   - Einen Trigger auf abgeschlossene Video-Einträge setzen, damit auch Motion Studio, Director’s Cut, Universal Creator und AI Video Toolkit nach jedem neuen Video automatisch bereinigt werden.
   - Damit ist die Regel nicht mehr davon abhängig, ob ein bestimmter Generator die Cleanup-Funktion manuell aufruft.

3. Bestehenden Überhang bereinigen
   - Einmalig die aktuell überzähligen Videos des betroffenen Nutzers bereinigen, sodass aus 545/500 wieder 500/500 wird.
   - Es werden die ältesten Einträge entfernt, nicht die neuesten.

4. Mediathek-Frontend korrigieren
   - Die Client-Cleanup-Logik bleibt für manuelle Uploads erhalten, wird aber so angepasst, dass sie konsistent mit der Backend-Regel ist.
   - Nach Upload/Import/Realtime-Update wird die Mediathek erneut geladen, damit der Zähler sofort korrekt ist.
   - Die Warnung „Limit erreicht“ bleibt sichtbar bei 500/500, aber nicht mehr dauerhaft bei 545/500.

5. Optionales Storage-Aufräumen best-effort
   - Wo Speicherpfade eindeutig erkennbar sind, wird beim Löschen auch das zugehörige Storage-Objekt entfernt.
   - Für externe/alte URLs ohne internen Speicherpfad wird mindestens der Datenbankeintrag entfernt, damit die Mediathek und das Limit korrekt bleiben.

Technische Details:
- Primär betroffen: `src/pages/MediaLibrary.tsx`, `src/lib/media-library/autoCleanup.ts` und eine neue Datenbankmigration.
- Die eigentliche Ursache liegt darin, dass `handleUpload()` `enforceLimits()` nutzt, aber neue KI-Videos direkt in `video_creations` landen.
- Die neue Server-Regel stellt sicher, dass alle zukünftigen Generatoren automatisch unter das Limit fallen, auch wenn später weitere Video-Funktionen hinzukommen.

Nach Freigabe implementiere ich das und prüfe anschließend per Datenbankabfrage, dass der betroffene Account nicht mehr über 500 Videos liegt.