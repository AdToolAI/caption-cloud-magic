# Publish-Cockpit: Hub "Planen" zusammenlegen

Nur der Bereich "Planen" wird angefasst. Alles andere bleibt unverändert.

## Ausgangslage

Der Hub zeigt vier Kacheln: Intelligenter Kalender, Content-Planer, Composer, Posting-Zeit-Berater. Das sind vier Seiten für einen einzigen Ablauf: Post schreiben, Zeit wählen, Überblick behalten.

## Ziel

Eine Seite `/publish` mit vier Ansichten:

1. **Composer** — schreiben, Medien, Kanäle (Startansicht)
2. **Kalender** — Monats- und Wochenansicht aller geplanten Posts
3. **Board** — Drag-and-Drop-Pipeline (Idee, Entwurf, Freigabe, Geplant)
4. **Beste Zeiten** — Zeitempfehlungen pro Kanal

## Verzahnung statt nur Tabs

- Im Composer steht am Zeitfeld direkt die empfohlene beste Zeit mit "übernehmen".
- Klick auf einen Kalendereintrag öffnet ihn im Composer, ohne die Seite zu wechseln.
- Board-Karten lassen sich in den Kalender ziehen und sind damit terminiert.

## Visuell

Kopfbereich mit schmalem Gold-Verlauf, Titel in Playfair Display, rechts Status-Chips (verbundene Kanäle, geplante Posts). Darunter eine goldene Segment-Leiste im Glas-Stil, aktives Segment mit weichem Glow, auf Mobil horizontal scrollbar. Wechsel per kurzem Crossfade, die Kopfzeile bleibt stehen. Im Hub ersetzt eine breite Kachel die vier bisherigen, mit den vier Ansichtsnamen als Mini-Labels darunter.

## Technisch

- Neue Seite `src/pages/PublishCockpit.tsx`, die `Composer`, `Calendar`, `Planner` und `PostingTimes` als Inhalt rendert. Keine Logikänderung in diesen Seiten, nur ein `embedded`-Prop, das die eigene Überschrift ausblendet.
- Ansicht in der URL: `/publish?view=composer|calendar|board|times`.
- Alte Routen bleiben und leiten weiter: `/composer`, `/calendar`, `/planner`, `/posting-times`, `/post-time-advisor`.
- `src/config/hubConfig.ts`: vier Einträge durch einen ersetzen, neues Cover im Bond-Gold-Stil.
- Sidebar und Command-Palette angleichen, Übersetzungen für DE/EN/ES ergänzen, `src/config/seo.ts` aktualisieren.

## Reihenfolge

1. Seite mit Umschalter und den vier eingebetteten Ansichten
2. Weiterleitungen der alten Routen
3. Verzahnung (beste Zeit, Kalender zu Composer, Board zu Kalender)
4. Hub-Kachel, Sidebar, Übersetzungen, SEO
