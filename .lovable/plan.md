# Feature-Konsolidierung: weniger Kacheln, gleiche Funktionen

Ziel: die Feature-Fläche verdichten, ohne Funktionalität zu verlieren. Zusammengelegt wird nur dort, wo Nutzer die Tools ohnehin in einem Arbeitsgang benutzen. Alle bestehenden Routen bleiben als Weiterleitung erhalten, damit Links, SEO und Onboarding nicht brechen.

## Was zusammengelegt wird (lohnt sich)

### 1. Publish-Cockpit (Hub "Planen": 4 Kacheln -> 1)
Kalender, Content-Planer, Composer und Posting-Zeit-Berater sind ein einziger Workflow: Post schreiben -> Zeit wählen -> im Kalender/Board sehen.

Neue Seite `/publish` mit vier Tabs:
- **Composer** (Schreiben/Medien/Kanäle) — bestehende Composer-Seite als Tab-Inhalt
- **Kalender** — bestehende Calendar-Seite
- **Board** — bestehender Content-Planer
- **Beste Zeiten** — Posting-Zeit-Berater, zusätzlich als Inline-Vorschlag direkt im Composer-Zeitfeld ("beste Zeit übernehmen")

Der Hub "Planen" zeigt danach eine Kachel statt vier.

### 2. Bild-Tools (Hub "Erstellen": 3 Kacheln -> 1)
KI Picture Studio, Post Designer und KI-Post-Generator/Image-Caption-Pairing überschneiden sich stark (Bild erzeugen -> Text drauf -> Caption).
Zusammenfassung zu **"Image Studio"** mit Tabs: *Motiv erzeugen*, *Post gestalten*, *Caption & Text*. Post Designer bleibt technisch unverändert, wird nur als Tab eingehängt.

### 3. Analytics (Hub "Analysieren": 3 Kacheln -> 1)
Analytics, PostHog Dashboard und Usage Reports werden zu **"Analytics"** mit Tabs *Performance*, *Produkt*, *Verbrauch*. Trend Radar und AI Text Studio bleiben eigenständig (anderer Zweck).

## Was bewusst getrennt bleibt
- **Motion/Video-Studios** (Universal Creator, Video Composer, Director's Cut, AI Video Studio) — unterschiedliche Pipelines und Laufzeiten; ein Merge würde die Lip-Sync-Kette anfassen. Nicht anrühren.
- **Cast & World, Creator Library, Marketplace, Lizenzen** — Bibliotheken vs. Handel, unterschiedliche Datenmodelle.
- **Team, Brand Kit, White Label** — Einstellungsebene, kein Arbeitsablauf.
- **Autopilot** — bleibt der eine Ein-Klick-Einstieg, wird nicht in ein Cockpit geschoben.

## Technische Umsetzung
- Neue Container-Seiten `src/pages/PublishCockpit.tsx`, `src/pages/ImageStudio.tsx`, Analytics-Container; jede rendert die bestehenden Seitenkomponenten als Tab-Inhalt (kein Logik-Umbau, kein Edge-Function-Change).
- Bestehende Seiten werden zu Komponenten mit optionalem `embedded`-Flag (blendet nur die eigene Seitenüberschrift/Padding aus).
- Tab-Zustand in der URL (`/publish?tab=calendar`), damit Deep-Links und Zurück-Navigation funktionieren.
- Alte Routen (`/calendar`, `/planner`, `/composer`, `/posting-times`, `/picture-studio`, `/post-designer`, `/analytics/posthog`, `/analytics/usage-reports`) bleiben und leiten per `Navigate` auf den passenden Tab.
- `src/config/hubConfig.ts`: die zusammengelegten Einträge durch je einen ersetzen, neue Cover-Bilder im Bond-Gold-Stil.
- Sidebar/Command-Palette-Einträge und `src/config/seo.ts` entsprechend angleichen.

## Reihenfolge
1. Publish-Cockpit (größter sichtbarer Gewinn)
2. Image Studio
3. Analytics-Tabs
