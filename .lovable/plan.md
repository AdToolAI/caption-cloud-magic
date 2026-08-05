# Feature-Konsolidierung: aus vielen Kacheln werden wenige Cockpits

Ziel: die Oberfläche verdichten, ohne eine einzige Funktion zu verlieren. Zusammengelegt wird nur dort, wo der Nutzer die Tools ohnehin in einem Arbeitsgang benutzt. Alle bisherigen Routen bleiben als Weiterleitung bestehen, damit Links, Onboarding-Mails und SEO nicht brechen.

## Leitprinzip

Ein Feature bleibt eigenständig, wenn es einen eigenen Zweck, ein eigenes Datenmodell **und** einen eigenen Einstiegsmoment hat. Es wird zu einem Tab, wenn es nur ein Schritt innerhalb eines Ablaufs ist, den man selten alleine öffnet.

## Was zusammengelegt wird

### 1. Publish-Cockpit — Hub "Planen": 4 Kacheln zu 1
Kalender, Content-Planer, Composer und Posting-Zeit-Berater sind derselbe Ablauf: Post schreiben, Zeit wählen, Überblick behalten.

Neue Seite `/publish` mit vier Ansichten:
- **Composer** — Schreiben, Medien, Kanäle (Standardansicht)
- **Kalender** — Monats-/Wochenansicht aller geplanten Posts
- **Board** — Drag-and-Drop-Pipeline (Idee, Entwurf, Freigabe, Geplant)
- **Beste Zeiten** — Zeitempfehlungen pro Kanal

Echte Verzahnung statt nur Tabs nebeneinander:
- Im Composer-Zeitfeld erscheint direkt der Vorschlag der besten Zeit mit "übernehmen".
- Klick auf einen Kalendereintrag öffnet ihn im Composer-Tab, ohne die Seite zu verlassen.
- Karten aus dem Board lassen sich per Drag in den Kalender ziehen und werden damit terminiert.

### 2. Image Studio — Hub "Erstellen"/"Optimieren": 3 Kacheln zu 1
KI Picture Studio, Post Designer und Image-Caption-Pairing sind hintereinandergeschaltete Schritte: Motiv erzeugen, Post gestalten, Caption schreiben.

Neue Seite `/image-studio` mit den Schritten *Motiv*, *Design*, *Caption*. Das erzeugte Motiv wandert ohne Umweg über die Mediathek in den Designer; der fertige Post geht mit einem Klick in den Composer.

### 3. Analytics — Hub "Analysieren": 3 Kacheln zu 1
Analytics, PostHog Dashboard und Usage Reports werden zu einer Seite mit den Reitern *Performance*, *Produkt*, *Verbrauch*. Trend Radar und AI Text Studio bleiben eigenständig — anderer Zweck, anderer Einstiegsmoment.

## Was bewusst getrennt bleibt

- **Video-Studios** (Universal Creator, Video Composer, Director's Cut, AI Video Studio, Motion Studio) — verschiedene Pipelines, lange Laufzeiten, eingefrorene Lip-Sync-Kette. Ein Merge würde genau diese Kette anfassen. Nicht anrühren.
- **Cast & World, Creator Library, Marketplace, Lizenzen** — Bibliothek gegen Handel, getrennte Datenmodelle.
- **Team, Brand Kit, White Label** — Einstellungsebene, kein Arbeitsablauf.
- **Autopilot** — bleibt der eine Ein-Klick-Einstieg und wird in kein Cockpit geschoben.

## Visuelles Konzept

Ein einheitliches Cockpit-Layout für alle drei Seiten, im bestehenden Bond-Gold-Stil:

```text
+--------------------------------------------------------------+
|  [Icon]  Publish-Cockpit                    [Status-Chips]    |
|  Ein Ort fuer Text, Timing und Uebersicht                     |
+--------------------------------------------------------------+
|  ( Composer )  ( Kalender )  ( Board )  ( Beste Zeiten )      |
+--------------------------------------------------------------+
|                                                              |
|                    Inhalt der aktiven Ansicht                |
|                                                              |
+--------------------------------------------------------------+
```

- **Kopfbereich**: ein Cover-Bild als schmaler Gold-Verlauf, Titel in Playfair Display, Untertitel in Inter, rechts Status-Chips (verbundene Kanäle, geplante Posts, Credits).
- **Umschalter**: goldene Segment-Leiste mit Glas-Effekt, aktives Segment mit weichem Gold-Glow, kein harter Tab-Rahmen. Auf Mobil scrollbar.
- **Übergang**: kurzes Crossfade beim Wechsel, kein Layout-Sprung — die Kopfzeile bleibt stehen.
- **Hub-Kacheln**: statt vier kleiner Karten eine breite Kachel mit vier Mini-Labels darunter, damit sichtbar bleibt, dass nichts verschwunden ist.
- **Konsistenz**: dieselbe Kopf-/Umschalter-Komponente für alle drei Cockpits, damit die Plattform ruhiger wirkt.

## Technische Umsetzung

- Neue Container: `src/pages/PublishCockpit.tsx`, `src/pages/ImageStudio.tsx`, `src/pages/AnalyticsCockpit.tsx`. Sie rendern die bestehenden Seitenkomponenten als Inhalt — keine Logikänderung, keine Edge-Function-Änderung.
- Gemeinsame Komponente `src/components/cockpit/CockpitShell.tsx` (Kopf, Segment-Leiste, Crossfade) plus `CockpitTab`-Typ.
- Bestehende Seiten erhalten ein optionales `embedded`-Prop, das nur eigene Seitenüberschrift und Außenabstand ausblendet. Die Seiten bleiben unter ihrem Dateinamen bestehen.
- Tab-Zustand in der URL: `/publish?view=calendar`. Deep-Links und Zurück-Navigation funktionieren dadurch weiter.
- Alte Routen bleiben und leiten weiter: `/calendar`, `/planner`, `/composer`, `/posting-times`, `/post-time-advisor` zu `/publish?view=...`; `/picture-studio`, `/post-designer`, `/image-caption-pairing` zu `/image-studio?view=...`; `/analytics/posthog`, `/analytics/usage-reports` zu `/analytics?view=...`.
- `src/config/hubConfig.ts`: die zusammengelegten Einträge durch je einen ersetzen, neue Cover-Bilder im Bond-Gold-Stil.
- `src/components/AppSidebar.tsx`, Command-Palette und `src/config/seo.ts` entsprechend angleichen; Übersetzungs-Keys in `src/lib/translations.ts` für DE/EN/ES ergänzen.
- Übergabe zwischen den Ansichten über einen leichten Kontext pro Cockpit (z. B. ausgewählter Post, erzeugtes Motiv) statt über die URL.

## Reihenfolge

1. `CockpitShell` plus Publish-Cockpit inklusive Weiterleitungen
2. Image Studio mit Motiv-zu-Designer-Übergabe
3. Analytics-Reiter
4. Hub-Kacheln, Sidebar, Übersetzungen und SEO nachziehen
