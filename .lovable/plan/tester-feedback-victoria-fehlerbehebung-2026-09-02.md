# Tester-Feedback (Victoria) — Fehlerbehebung

Ziel: die konkret gemeldeten Fehler beheben, in der Reihenfolge ihrer Auswirkung auf die Nutzung. Keine Änderungen an der Lip-Sync-Kette.

## 1. Datenverlust beim Tab-Wechsel (höchste Priorität)

Gemeldet: Beim Wechsel in einen anderen Browser-Tab und zurück sind alle Eingaben im Video-Setup weg.

- Der Composer speichert den Entwurf heute nur über einen Effekt beim Ändern des Projekt-Objekts; es gibt keinen Speicherpunkt beim Verlassen bzw. Wiedereintritt des Tabs.
- Ergänzt wird ein Sicherungspunkt auf `visibilitychange`/`pagehide` sowie eine Wiederherstellung beim Zurückkehren, damit ein zwischenzeitliches Neu-Mounten den Entwurf nicht mit einem leeren Zustand überschreibt.
- Zusätzlich eine sichtbare Bestätigung („Entwurf gespeichert“), damit Nutzer dem Zustand vertrauen.

## 2. Guthaben dauerhaft sichtbar

Gemeldet: Das Token-/Credit-Guthaben sollte immer sichtbar sein.

- In der Kopfzeile steht aktuell nur die Streak-Flamme; ein Credit-Stand existiert dort nicht.
- Neu: ein kompakter Guthaben-Chip in der Kopfzeile neben dem Profil-Icon, auf allen Seiten sichtbar, klickbar zur Guthaben-/Kaufansicht, mit Ladezustand und Aktualisierung nach Verbrauch.

## 3. Buttons reagieren erst beim zweiten Klick / erste zwei Sidebar-Icons unscharf ohne Text

- Die Sidebar-Hub-Buttons und die Kopfzeile werden reproduziert und geprüft (Tooltip-Provider pro Element, Animations- und Fokus-Verhalten, Überlagerungen durch Blur-Ebenen).
- Ursache wird vor dem Fix im Browser bestätigt; erst danach wird korrigiert (z. B. gemeinsamer Tooltip-Provider, stabile Trefferfläche, keine überlagernde Blur-Schicht über den ersten Einträgen).
- Kein Umbau des Navigationskonzepts.

## 4. Fehler beim Speichern des Profils

- Der Speicherpfad im Konto-/Profilbereich wird end-to-end geprüft (Feldvalidierung, Berechtigungen, Rückgabefehler).
- Korrigiert wird die konkrete Ursache; zusätzlich bekommt das Formular verständliche Feldfehler statt einer generischen Fehlermeldung.

## 5. Videoerzeugung schlägt beim ersten Versuch fehl

Beleg aus den Screenshots: `veo-3.1-fast`, Fehler `{'code': 8, 'message': 'The service is currently experiencing high load...'}` — eine Überlastmeldung des Anbieters, kein Eingabefehler.

- Für diese Überlastklasse wird ein begrenzter automatischer Wiederholungsversuch mit Wartezeit eingeführt, bevor der Auftrag als fehlgeschlagen gilt.
- Bleibt es dabei, erscheint eine klare Meldung („Anbieter überlastet, bitte erneut versuchen“) statt der rohen technischen Fehlermeldung, plus ein Button „Erneut versuchen“, der die Eingaben behält — heute muss der Nutzer die Felder neu ausfüllen.
- Die Rückerstattung für genau diesen Fehlerfall wird geprüft und, falls sie nicht garantiert greift, abgesichert.

## 6. Falsche Kostenvorschau

- Die Anzeige der geschätzten Kosten wird gegen die tatsächliche Abrechnung pro Modell und Dauer abgeglichen; abweichende Stellen werden korrigiert, sodass Vorschau und Abbuchung übereinstimmen.

## 7. Absturz „Failed to execute 'removeChild' on 'Node'“

- Die Ursache wird zuerst reproduziert (typisch: eine Ebene, die außerhalb von React DOM-Knoten entfernt — Dialoge, Portale, Download-Links, Browser-Übersetzung).
- Zusätzlich wird die betroffene Ansicht mit einer Fehlergrenze abgesichert, damit ein solcher Fehler nicht die ganze Seite unbenutzbar macht.

## Nicht in diesem Durchgang

Die Wünsche zu „weniger Felder / mehr Minimalismus“ im Erstellungsschritt sind Design-Arbeit und werden getrennt geplant, nachdem die Fehler behoben sind.

## Verifikation

- Tab-Wechsel-Test: Eingaben ausfüllen, Tab wechseln, zurückkehren — Daten unverändert.
- Guthaben-Chip auf mehreren Seiten sichtbar und korrekt.
- Klick-Test auf Sidebar und Kopfzeile ohne Vorfokus; erste Klicks lösen aus.
- Profil speichern erfolgreich; Fehlerfälle zeigen Feldmeldungen.
- Erzwungener Anbieter-Überlastfehler: Wiederholung greift, Meldung verständlich, Eingaben bleiben erhalten, Guthaben stimmt danach.
- Kostenvorschau gegen tatsächliche Abbuchung für mindestens zwei Modelle geprüft.
