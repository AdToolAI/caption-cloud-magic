# Signup-Abnahme: Google, Passwortregeln, Onboarding-Parität

## Was ich vorab geprüft habe (read-only)

- Die Kontoanlage hängt an fünf Datenbank-Auslösern auf der Nutzertabelle (Profil, Guthaben-Wallet, Standard-Workspace, Speicher, E-Mail-Bestätigungs-Sync). Alle feuern beim Anlegen eines Nutzers — unabhängig davon, ob per Google oder per E-Mail. Das ist ein starkes Indiz für gleiche Behandlung, aber noch kein Beweis: ein echter Google-Durchlauf muss zeigen, dass Profil, Wallet-Startguthaben und Workspace identisch entstehen.
- Die Fehlerzuordnung unterscheidet bereits sauber zwischen "in Datenlecks bekannt" (nur bei Provider-Meldungen wie *pwned/compromised/breach/leaked*) und "erfüllt Anforderungen nicht". Es wird nichts geraten.
- Die Registrierung leitet nach dem Absenden auf eine eigene "Check your email"-Seite mit Adresse im Link; ein bereits bestätigtes Konto wird beim Anmeldeversuch erkannt und dorthin geführt.
- Passwortfeld: Ein-/Ausblenden vorhanden, `autocomplete` gesetzt (`new-password` / `current-password`), keine Längenbegrenzung nach oben.
- Nicht vorhanden: automatisierte Tests für Passwortregeln und Fehlermeldungen, ein Terms-/Consent-Schritt in der Registrierung (weder bei E-Mail noch bei Google), `autocomplete="email"` auf dem E-Mail-Feld, ein Caps-Lock-Hinweis.
- Noch offen und nur live prüfbar: die serverseitige Passwort-Policy (Mindestlänge, geforderte Zeichenklassen) — die steht in den Kontoeinstellungen des Backends, nicht im Code. Genau hier entsteht der Fall "vorne alles grün, hinten abgelehnt".

## Gate 1 — Verifikation (keine Änderungen)

1. **Server-Policy auslesen und mit der Oberfläche vergleichen.** Mindestlänge und geforderte Zeichenklassen im Backend gegen die drei angezeigten Regeln stellen. Bei Abweichung: Server auf Mindestlänge 8 ohne erzwungene Zeichenklassen setzen, damit beide Seiten dasselbe sagen.
2. **Google End-to-End im Browser**, Desktop und Mobilbreite:
   - neuer Nutzer → Kontowahl → Konto entsteht → Sitzung aktiv → Landung im Dashboard
   - danach in der Datenbank prüfen: Profil, Wallet-Startguthaben, Workspace, Rolle und Metadaten identisch zu einem E-Mail-Signup
   - bestehende E-Mail-Adresse, die auch das Google-Konto ist → wird verknüpft oder entsteht ein Zweitkonto? Ergebnis wird benannt.
   - Abbruch im Google-Fenster und provozierter Provider-Fehler → verständliche Meldung, kein toter Bildschirm
3. **Kundenfall nachstellen:** 12 Zeichen, Groß/Klein, Zahl, Sonderzeichen → muss durchgehen, sofern kein echter Leck-Treffer vorliegt. Wird es abgelehnt, wird die exakte Server-Antwort protokolliert.
4. **E-Mail-Strecke:** Registrierung → "Check your email" → Erneut-senden → Bestätigungslink → erster Login. Wiederholte Registrierung auf bestätigtes Konto ebenfalls durchspielen.
5. **Eingabe-Komfort:** Einfügen aus der Zwischenablage, Passwortmanager, Browser-Autofill, Caps-Lock, Ein-/Ausblenden.

Ergebnis von Gate 1: eine Befundliste mit Screenshots pro Punkt.

## Gate 2 — Korrekturen aus den Befunden

Fest eingeplant, unabhängig vom Befund:

- `autocomplete="email"` auf dem E-Mail-Feld, damit Autofill und Passwortmanager sauber greifen.
- Caps-Lock-Hinweis unter dem Passwortfeld, in EN/DE/ES.
- Fehlermeldungen ergänzen, die heute noch generisch durchlaufen: Google-Login abgebrochen, OAuth-Provider-Fehler, Netzwerkfehler ohne Verbindung — jeweils EN/DE/ES, angebunden an die bestehende Zuordnung.
- Verknüpfungs-Fall: falls Gate 1 ein Zweitkonto zeigt, bekommt der Nutzer beim Google-Login mit bereits bestehender E-Mail-Registrierung eine klare Meldung mit dem Weg über E-Mail-Login statt eines stillen Doppelkontos.

Alles Weitere richtet sich nach den Befunden und wird vor der Umsetzung benannt.

## Gate 3 — Regressionstests

Neue Testdatei zu Passwort und Auth-Fehlern:

- Kundenfall `Sommer2026!Xy` (12 Zeichen, alle Klassen) gilt als gültig.
- Grenzfälle: 7 Zeichen ungültig, 8 Zeichen mit Zahl gültig, reine Buchstaben ungültig, 100-Zeichen-Passphrase gültig.
- Fehlerzuordnung: nur Provider-Antworten mit *pwned/compromised/breach/leaked* erzeugen die Datenleck-Meldung; ein generisches "weak password" darf sie nie erzeugen.
- Jede Auth-Fehlermeldung existiert in EN, DE und ES.

## Technisch

- Server-Policy über die Auth-Konfiguration lesen/setzen; nur diese eine Einstellung wird angefasst, keine weiteren Projekteinstellungen.
- Google-Durchlauf per Playwright gegen die lokale Vorschau, Viewports 1280 und 390. Der Google-Kontowahl-Dialog liegt außerhalb der App — falls der Provider-Dialog im Automatiktest nicht bedienbar ist, wird der Teil manuell in der Vorschau geprüft und das offen benannt statt als grün gemeldet.
- Datenbankvergleich Google- vs. E-Mail-Nutzer über Lesequeries auf Profil, Wallet, Workspace und Metadaten.
- Testdatei unter `src/test/auth-password-policy.test.ts`, Ausführung mit der bestehenden Test-Suite.
- Keine Änderung an Billing, Guthabenlogik, Video- oder Lip-Sync-Pfaden.

## Was nicht Teil dieses Gates ist

Ein Terms-/Consent-Schritt existiert heute in keinem der beiden Wege. Google überspringt also nichts, was E-Mail-Nutzer durchlaufen. Wenn eine Zustimmungs-Checkbox gewünscht ist, wäre das ein eigener Schritt für beide Wege gleichzeitig — sag Bescheid, dann nehme ich ihn auf.
