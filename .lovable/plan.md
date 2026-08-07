# Neuer Account: Was jetzt noch fehlt (Portfolio-Zugriff ist schon da)

## Befund aus deinem Screenshot

Unter Nutzer → Personen steht dein Profil mit **„Uneingeschränkter Zugriff / Alles"**. Die Portfolio-Rolle ist also nicht das Problem — der Punkt „Vollzugriff geben" entfällt.

Damit bleiben genau zwei Stellen übrig, die Meta braucht, damit im Login-Dialog Asset-Zeilen erscheinen:
1. Die Seite muss unter **Konten → Seiten** in diesem Portfolio liegen (im Besitz, nicht nur verbunden).
2. Die App **AdTool AI** muss unter **Konten → Apps** im Portfolio eingetragen sein. Fehlt der App-Eintrag, liefert Meta bei `business_management` schlicht nichts — genau das haben wir gemessen (0 Seiten, Berechtigung nicht erteilt).

Dazu kommt die alte, leere App-Zustimmung, die Meta sonst stillschweigend wiederverwendet.

## Schritt für Schritt

**1. Seiten prüfen**
Einstellungen → Konten → **Seiten**. Steht „AdTool AI" dort? Wenn nein: „Hinzufügen" → **Seite beanspruchen** (nicht „Zugriff anfordern") → Seite auswählen → bestätigen.
Wenn ja: Seite anklicken → rechts unter **Personen** muss dein Profil mit aktivierten Aufgaben (Inhalte, Insights, Nachrichten) stehen. Sonst dort hinzufügen.

**2. App im Portfolio eintragen — das ist der wahrscheinlich fehlende Punkt**
Einstellungen → Konten → **Apps** → „Hinzufügen" → **App-ID unserer Meta-App** eintragen (die ID aus dem Secret `META_APP_ID`; ich nenne sie dir im nächsten Schritt, sobald der Plan freigegeben ist). Danach der App die Seite „AdTool AI" als Asset zuweisen.

**3. Alte Zustimmung löschen**
facebook.com mit demselben Profil → Einstellungen und Privatsphäre → Einstellungen → **Apps und Websites** → „AdTool AI" → **Entfernen**. Ohne das zeigt Meta wieder den verkürzten 3-Schalter-Dialog.

**4. Neu verbinden und prüfen**
AdTool AI → /integrations → Facebook „Verbinden". Der Dialog muss jetzt zeigen:
- „Manage your business" mit dem Portfolio **AdTool AI**
- „Create and manage content on your Page" mit der Seite **AdTool AI**
Beides anhaken → Fertig. Die Karte muss danach „1 Seite gefunden" melden und den Auswahldialog öffnen.

**5. Falls weiterhin 0 Seiten**
Im Diff-Panel „Vergleich laden" — dort steht dann schwarz auf weiß, welche Berechtigung Meta verweigert hat. Erst danach folgt ein weiterer Fix, nicht auf Verdacht.

## Was ich in der App ändere

Kein Eingriff in OAuth, Scopes oder Datenbank — nur der 0-Seiten-Zustand wird handlungsleitend:

- Der Warnblock auf der Facebook-Karte ersetzt die pauschale Meldung durch diese Prüfliste: Seite im Portfolio beansprucht · App im Portfolio eingetragen · alte App-Zustimmung entfernt — jeweils mit Direktlink (Business-Suite-Einstellungen, Facebook „Apps und Websites").
- Die Meta-App-ID wird in dem Block angezeigt, damit man sie beim Schritt „App hinzufügen" direkt kopieren kann (die App-ID ist öffentlich, kein Secret).
- Aktionsreihenfolge: „Zustimmung zurücksetzen und neu verbinden" zuerst, „Mit anderem Facebook-Konto verbinden" als Zweitoption.

## Technische Details

- `src/components/performance/ConnectionsTab.tsx`: Inhalt des `metaIncomplete`-Blocks auf die 3-Punkte-Checkliste + Links + App-ID-Anzeige umstellen, Buttonreihenfolge anpassen.
- Meta-App-ID im Frontend über eine bestehende Health-/Config-Antwort beziehen (kein neues Secret im Client).
- `src/lib/translations.ts`: `metaNoPagesBody` präzisieren, neue Checklisten-Schlüssel in DE/EN/ES.
- Keine Änderung an `oauth-callback`, Scopes, Datenbank oder Meta-App-Konfiguration.
