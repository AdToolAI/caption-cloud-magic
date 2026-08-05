# Content Command Center — die vier „Planen“-Bereiche werden ein Feature

Kalender, Content-Planer, Composer und Posting-Zeit-Berater sind vier Schritte desselben Ablaufs: Post erstellen → Zeitpunkt wählen → einplanen → verwalten. Sie werden zu einem Hauptbereich zusammengeführt. Kein Feature entfällt.

## Der neue Bereich

**Content Command Center**
Untertitel: „Erstelle, plane und veröffentliche deinen Content über alle Plattformen.“
Rechts oben dauerhaft sichtbar: **+ Neuer Post**

Vier Ansichten innerhalb der Seite:

| Ansicht | Inhalt | Quelle heute |
|---|---|---|
| Kalender | Monat, Woche, Liste, Kanban, Heatmap, Filter, Entwürfe, Status | `/calendar` |
| Beiträge | alle Posts als Grid/Liste, Entwürfe, geplant, veröffentlicht | `/planner` |
| Kampagnen | mehrteilige Kampagnen mit Zeitstrahl | `/planner` |
| Beste Zeiten | 14-Tage-Prognose je Plattform | `/posting-times` |

Der **Composer** ist keine Ansicht mehr, sondern die Aktion hinter „+ Neuer Post“ — er öffnet sich als Vollflächen-Ebene über dem Command Center und schließt zurück in die zuletzt genutzte Ansicht. In der Feature-Sprache heißt er „Post erstellen“ statt „Composer“.

## Bezeichnung vereinheitlichen

Heute stehen auf derselben Seite drei Namen: Breadcrumb „Intelligenter Kalender“, Badge „Intelligenter Kalender“, Titel „Content Command Center“. Künftig gilt überall nur **Content Command Center**; „Kalender“ ist nur noch der Name der Ansicht.

## Verzahnung der Funktionen

- **Beste Zeiten im Planungsdialog:** beim Terminieren erscheinen drei konkrete Empfehlungen („Heute 21:00 – sehr gut“) direkt zur Auswahl, statt nur als eigene Analyseseite.
- **Heatmap im Kalender:** die vorhandene Heatmap-Ansicht wird mit denselben Score-Daten gespeist wie der Tab „Beste Zeiten“.
- **Kalender ↔ Composer:** Klick auf einen Kalendereintrag öffnet ihn direkt im Composer; Speichern springt in die Ausgangsansicht zurück.
- **Beiträge ↔ Kalender:** ein Entwurf aus der Beiträge-Ansicht lässt sich terminieren und erscheint sofort im Kalender.

## Hub-Kachel „Planen“

Statt vier gleich großer Kacheln eine große Hauptkarte:

> **Content Command Center**
> Erstelle, optimiere, plane und veröffentliche deine Inhalte über alle verbundenen Plattformen – zum optimalen Zeitpunkt.
> Kleingedruckt darunter: KI-Composer · Content-Kalender · Kampagnen · Beste Posting-Zeiten · Multi-Channel-Publishing
> Button: **Content planen**

In der Karte vier kleine Vorschaufelder (Kalender, Beiträge, Kampagnen, Beste Zeiten), die direkt in die jeweilige Ansicht springen — die Fähigkeiten bleiben sichtbar, wirken aber als ein System.

## Visuell

Bond-Gold-Kopfzeile im Stil der übrigen Cockpits: Playfair-Display-Titel, feiner Goldverlauf, Glas-Umschalter für die vier Ansichten mit weichem Goldschimmer auf der aktiven Ansicht, „+ Neuer Post“ als goldener Primärbutton. Innerhalb der Ansichten bleibt das bestehende Layout unverändert, damit nichts an Bedienung verloren geht.

## Technische Umsetzung

- Neue Route `/command-center` mit einer Shell-Komponente (Kopfzeile, Ansichts-Umschalter, Composer-Ebene). Der aktive Tab steht in der URL (`?view=calendar|posts|campaigns|times`), damit Deep-Links und Zurück-Navigation funktionieren.
- Die bestehenden Seiten `CalendarPage`, `Planner`, `PostingTimes` und `Composer` werden **nicht neu geschrieben**: sie bekommen einen `embedded`-Modus, der die eigene Seitenkopfzeile und den Seitenrahmen ausblendet, und werden in der Shell gerendert. Datenhooks (`usePostingTimes`, Kalender-/Planner-Queries) und alle Edge Functions bleiben unverändert.
- Aus `Planner` werden „Beiträge“ und „Kampagnen“ als zwei Ansichten desselben Moduls angesteuert (vorhandener interner Umschalter wird per Prop gesetzt).
- Alte Routen `/calendar`, `/planner`, `/posting-times`, `/composer` bleiben bestehen und leiten mit dem passenden `?view=`-Parameter auf `/command-center` um; bestehende Links und Lesezeichen brechen nicht.
- `src/config/hubConfig.ts`: die vier Einträge im Bereich „Planen“ werden durch einen breiten Eintrag ersetzt; die vier Cover-Bilder werden in der neuen Karte als Vorschaufelder weiterverwendet.
- Übersetzungen für EN/DE/ES ergänzen (neuer Bereichsname, Ansichtsnamen, „Post erstellen“).
- Zeitempfehlungen im Planungsdialog nutzen den vorhandenen `usePostingTimes`-Hook, keine neue Backend-Logik.

## Reihenfolge

1. Shell + Route + URL-Ansichtszustand, alte Seiten eingebettet
2. Hub-Kachel und Namensvereinheitlichung
3. Composer als „+ Neuer Post“-Ebene
4. Verzahnung: Zeitempfehlungen im Planungsdialog, Kalender→Composer, Entwurf→Termin
5. Redirects der Altrouten
