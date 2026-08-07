# Neuer Account: Schritt für Schritt in der Meta Business Suite

## Was dein Screenshot ändert

Das neue Portfolio „AdTool AI" **hat** eine Facebook-Seite (AdTool AI, inkl. verknüpftem Instagram). Trotzdem zeigte der Login-Dialog nur drei allgemeine Schalter ohne Seiten- und ohne Portfolio-Zeile. Das heißt: Nicht „keine Seite vorhanden", sondern **das Profil bzw. die App ist im Portfolio nicht so verknüpft, dass Meta die Seite als auswählbares Asset ausliefert.** Die drei häufigen Ursachen: Profil hat im Portfolio keinen Vollzugriff auf die Seite, die Seite ist dem Portfolio nur „beansprucht" aber dem Profil nicht zugewiesen, oder eine alte, leere Zustimmung der App wird stillschweigend wiederverwendet.

## Schritt für Schritt (in der Business Suite des neuen Accounts)

**1. Einstellungen öffnen**
Links unten „Einstellungen" → oben rechts „Alle Einstellungen ansehen".

**2. Dein Profil als Vollzugriff auf die Seite setzen**
Konten → **Seiten** → „AdTool AI" anklicken → Reiter **Personen** → dein Profil (Samuel Dusatko) auswählen → **Vollzugriff/Facebook-Zugriff** aktivieren, insbesondere „Inhalte erstellen", „Nachrichten", „Insights". Speichern.
Steht dein Profil dort nicht: „Personen hinzufügen" → dein Profil → Vollzugriff → Einladung im Profil bestätigen.

**3. Portfolio-Rolle prüfen**
Nutzer → **Personen** → dein Profil → Rolle muss **Vollzugriff (Administrator)** auf das Portfolio sein, nicht „Mitarbeiter".

**4. Seite wirklich beanspruchen**
Konten → Seiten → falls „AdTool AI" nur verbunden statt im Besitz ist: „Seite beanspruchen" ausführen. Nur beanspruchte Seiten liefert Meta über `business_management` an Apps aus.

**5. Alte App-Zustimmung löschen (wichtig)**
facebook.com mit demselben Profil → Einstellungen und Privatsphäre → Einstellungen → **Apps und Websites** → „AdTool AI" markieren → **Entfernen**. Ohne diesen Schritt zeigt Meta wieder den verkürzten Dialog.

**6. Neu verbinden**
Zurück in AdTool AI → /integrations → „Verbinden" bei Facebook. Im Dialog musst du jetzt sehen:
- „Manage your business" mit dem Portfolio **AdTool AI**
- „Create and manage content on your Page" mit der Seite **AdTool AI**
Beides anhaken → Weiter → Fertig.

**7. Ergebnis prüfen**
Die Facebook-Karte muss danach „X Seiten gefunden" mit X ≥ 1 zeigen, und der Seiten-Auswahldialog öffnet sich. Falls weiterhin 0: im Diff-Panel „Vergleich laden" — dort steht dann, welche Berechtigung Meta konkret verweigert hat.

## Was ich in der App parallel ändere

Kein Eingriff in OAuth oder Datenbank — nur der Befund wird handlungsleitend:

- Der Warnblock auf der Facebook-Karte nennt statt der pauschalen Meldung die konkrete Prüfliste (Vollzugriff auf die Seite, Seite beansprucht, App-Zustimmung entfernt) mit Direktlinks zu Business-Suite-Einstellungen und den Facebook-App-Einstellungen.
- Reihenfolge der Aktionen: erst „Zustimmung zurücksetzen und neu verbinden", dann „Mit anderem Facebook-Konto verbinden".
- Diese Prüfliste sieht auch jeder Kunde, den es trifft (Agenturen, Teams, Zweitprofile) — damit wird aus einem stummen 0-Seiten-Zustand eine lösbare Aufgabe.

## Technische Details

- `src/components/performance/ConnectionsTab.tsx`: Inhalt des `metaIncomplete`-Blocks auf die 3-Punkte-Checkliste + zwei externe Links umstellen, Buttonreihenfolge anpassen.
- `src/lib/translations.ts`: Schlüssel `metaNoPagesBody` präzisieren, neue Schlüssel für die Checkliste in DE/EN/ES.
- Keine Änderung an Scopes, `oauth-callback`, Datenbank oder Meta-App-Konfiguration.
