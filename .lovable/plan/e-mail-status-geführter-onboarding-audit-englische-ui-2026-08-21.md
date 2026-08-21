# E-Mail-Status + geführter Onboarding-Audit (englische UI)

## Was ich bereits verifiziert habe (read-only)

**Der E-Mail-Verkehr funktioniert.** Im Sendeprotokoll der letzten 7 Tage steht jede Zustellung auf "sent" — keine Fehlschläge, keine Warteschlangen-Rückstände, keine unzustellbaren Adressen. Auch die Bestätigungsmail an `mythoslabor@gmail.com` ging am 9. August raus und wurde am selben Tag angeklickt: **das Konto ist bereits bestätigt.**

Die heutige Registrierung war deshalb ein Wiederholungs-Signup auf ein bestehendes, bestätigtes Konto. In dem Fall verschickt das Auth-System bewusst keine Mail (Schutz davor, dass man fremde Adressen auf Existenz abfragen kann), meldet der Oberfläche aber "erfolgreich". Unsere Oberfläche schickt den Nutzer daraufhin auf die "Check your email"-Seite, wo er auf eine Mail wartet, die nie kommen wird. Das ist der eigentliche Fehler — nicht der Mailversand.

## Was dieser Gate tut

**1. Anmeldung als `mythoslabor@gmail.com`**
Über die interne Sitzungs-Ausstellung, ohne das Passwort des Nutzers zu benötigen und ohne sein Konto zu verändern.

**2. Kompletter Onboarding-Durchlauf in englischer UI**
Schritt für Schritt, mit Screenshot an jeder Station:
- Registrierungs-/Login-Seite inkl. des oben beschriebenen Wiederholungs-Signup-Falls
- "Check your email"-Seite und der "Resend"-Knopf
- Erstanmeldung → Onboarding-Strecke bis zur ersten Produktion
- Studio-Einstieg, Guthaben-/Trial-Anzeige, Konto- und Billing-Seiten
- Navigation, leere Zustände, Fehlerzustände

**3. Gesucht wird nach**
- deutschen oder spanischen Textresten in der englischen UI
- deutschen Datums-, Zeit- und Währungsformaten
- toten Enden, kaputten Links, Buttons ohne Wirkung
- Konsolen- und Netzwerkfehlern auf jedem Schritt
- Brüchen in der Erzählung (widersprüchliche Bezeichnungen, doppelte CTAs)

**4. Ergebnis**
Ein einziger Befundbericht: pro Fund Ort, Screenshot, Schweregrad und Ursache — plus die getrennt geführte Liste der Auth-Fehlbehandlung von oben. In diesem Gate wird **nichts** geändert; die Korrekturen kommen als nächster, eigener Schritt.

## Technisch

- Sitzung über `lovable auth-session --user fa258135-6ab7-4500-8761-02113832a9fe`, Playwright gegen die lokale Vorschau, Viewport 1280 breit.
- Sprache explizit auf EN gesetzt (der Sprachumschalter oben rechts), zusätzlich ein Durchlauf ohne gesetzte Präferenz, um den EN-Default zu bestätigen.
- Konsole und Netzwerk werden pro Schritt mitgeschnitten.
- Keine Schreibvorgänge in der Datenbank, kein Deploy, kein Publish. Falls ein Onboarding-Schritt zwingend Daten anlegt (z. B. ein Projekt), wird das benannt und auf das Minimum begrenzt.
