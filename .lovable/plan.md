# Lip-Sync: Beweisgeführte Ursachenklärung statt weiterer Patches

## Was ich gemessen habe (und was das widerlegt)

Ich habe die defekte Szene von heute (`c934a823…`) und die funktionierende Referenzszene vom 27.07. (`c01d339d…`) mit exakt derselben Methode verglichen.

- Meine vorherige These „Provider liefert unverändert zurück, erkennbar am Bildvergleich" ist **widerlegt**. Der 27.07.-Lauf zeigt praktisch dieselben Vergleichswerte wie heute. Dieses Signal taugt nicht als Unterscheidungsmerkmal.
- Die Preclips sind in beiden Läufen korrekt 720x720. Der zuvor vermutete 1284x718-Renderfehler existiert in den echten Dateien nicht.
- Messbar unterschiedlich ist das Ergebnis: Im Endclip vom 27.07. bewegt sich die Mundregion in allen vier Sprecherfenstern deutlich. Im heutigen Endclip ist sie in drei von vier Fenstern nahezu regungslos.
- Ebenfalls messbar: Die heutige Master-Plate ist als Ganzes fast eingefroren, die vom 27.07. hat durchgehend natürliche Bewegung. Die Passes 3 und 4 von heute zeigen im Anbieter-Output exakt so wenig Bewegung wie in ihrem Eingang, die Passes 1 und 2 dagegen mehr.
- Die Gesichtsgrößen sind **kein** Unterscheidungsmerkmal: Am 27.07. gab es Szenen mit ebenso kleinen Gesichtern.

Damit ist belegt **dass** heute Mundbewegung fehlt, aber **noch nicht bewiesen**, an welcher Station sie verloren geht. Genau das klärt Schritt 1, bevor irgendetwas geändert wird.

## Umsetzung

1. **Kontrollierter A/B-Nachweis, keine Codeänderung**
   - Die vier Preclips und Audiospuren vom 27.07. unverändert durch die heutige Kette schicken.
   - Ergebnis vergleichen: Kommt dieselbe Mundbewegung heraus wie am 27.07., liegt der Bruch **vor** dem Anbieter (Plate/Preclip). Kommt sie nicht heraus, liegt er **im Anbieter-Aufruf oder danach**.
   - Zusätzlich die heutigen Anbieter-Ausgaben durch den Stitch vom 27.07. schicken, um Stitch und Anbieter sauber zu trennen.
   - Ergebnis dieses Schritts entscheidet, welcher der folgenden Punkte überhaupt umgesetzt wird.

2. **Wenn der Bruch vor dem Anbieter liegt (Plate-Pfad)**
   - Die heutigen Plate-Parameter Feld für Feld gegen einen 27.07.-Lauf stellen: Bildausschnitt, Bewegungsvorgaben, Modell und Prompt-Bausteine.
   - Nur die tatsächlich abweichenden Felder zurückführen, damit die Plate wieder lebendige, sprechfähige Gesichter liefert.
   - Eine fast eingefrorene Plate vor dem Lip-Sync erkennen und als Klartext-Fehler mit Erstattung beenden, statt sie weiterzureichen.

3. **Wenn der Bruch beim Anbieter liegt**
   - Den heutigen Anbieter-Aufruf Feld für Feld gegen den 27.07.-Aufruf stellen: Modell, Gesichtsauswahl, Zeitfenster und Audiozuschnitt.
   - Abweichungen exakt auf den 27.07.-Stand bringen, ohne neue Varianten oder Wiederholungsketten einzuführen.

4. **Wenn der Bruch im Stitch liegt**
   - Prüfen, ob die Anbieter-Bewegung bei der Rückprojektion durch Maske, Zeitversatz oder darüberliegende Standbilder verdeckt wird.
   - Nur den betroffenen Teil auf den 27.07.-Stand zurückführen.

5. **Belastbares Abnahmekriterium**
   - Erst nach der Korrektur eine Qualitätsprüfung einbauen, deren Schwelle aus den gemessenen 27.07.-Werten abgeleitet ist statt geraten.
   - Prüfpunkt ist die Mundregion im Sprecherfenster des fertigen Clips, verglichen mit derselben Region außerhalb des Fensters.
   - Fällt die Prüfung durch, wird die Szene verständlich als fehlgeschlagen gemeldet und über den bestehenden idempotenten Weg erstattet.

6. **Freigabe**
   - Frische Vier-Sprecher-Szene erzeugen und dieselben Messungen fahren wie in Schritt 1.
   - Freigabe nur, wenn jeder Sprecher in seinem Dialogfenster messbar den Mund bewegt und die Werte im Bereich des 27.07.-Laufs liegen.

## Technische Leitplanken

- In Schritt 1 wird nichts geändert; er dient ausschließlich der Eingrenzung.
- Keine neue Retry-Ladder, keine neue Zustandsmaschine, keine weiteren Heuristiken auf Dateigröße.
- Änderungen nur an den Feldern, die der A/B-Nachweis konkret als abweichend ausweist.
- Fehlerpfade bleiben an die bestehende automatische, idempotente Rückerstattung gebunden.
