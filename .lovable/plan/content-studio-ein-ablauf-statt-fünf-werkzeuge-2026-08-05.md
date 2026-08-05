# Content Studio: ein Ablauf statt fünf Werkzeuge

Heute gibt es im Hub "Optimieren" sechs Seiten, die alle dasselbe Ziel umkreisen: aus einer Idee einen fertigen Beitrag machen. Der Nutzer muss den Weg selbst zusammensetzen. Statt sie unter Tabs zu bündeln, werden sie zu **einem durchgehenden Ablauf** verschmolzen.

Der KI Kommentar-Manager entfällt — er existiert bereits in Analytics.

## Der Ablauf

```text
Content Studio  ·  /content-studio

 1 Briefing        Thema, Ziel, Plattform, Tonalität, Marke
 2 Copy            KI-Varianten (Hook, Text, Hashtags) — auswählen, würfeln, feilen
 3 Motiv           KI-Bild, Mediathek, Stock oder ohne Bild
 4 Layout          Post Designer: Vorlagen-Varianten, Editor, Auto-Fit
 5 Ausspielen      Einzelpost oder Serie → Herunterladen · Veröffentlichen · Einplanen
```

Ein Fortschrittsband oben führt durch die Schritte, jeder Schritt bleibt jederzeit anklickbar. Rückwärts springen ändert nur den betroffenen Schritt, nicht die ganze Arbeit.

## Wo die fünf alten Features landen

| Bisher | Neu |
| --- | --- |
| KI Post-Generator | Schritt 1–2 (Briefing + Copy) |
| Bild-Text-Pairing | Schritt 3 — Motiv und Text werden gemeinsam bewertet, kein Extra-Werkzeug |
| Post Designer | Schritt 4 (Layout & Editor) |
| Vorlagen-Manager | Schublade "Vorlagen" — im Briefing laden, im Layout speichern |
| Kampagnen-Assistent | Schritt 5, Schalter **Serie statt Einzelpost**: aus demselben Briefing entstehen 5–10 Beiträge mit Terminvorschlägen |
| KI-Coach | Panel rechts, kennt den aktuellen Entwurf und kommentiert Schritt für Schritt |
| KI Kommentar-Manager | entfällt |

## Der eigentliche Mehrwert

- **Ein Briefing trägt bis zum Ende.** Thema, Marke und Zielplattform werden einmal gesetzt und speisen Copy, Bildprompt, Layoutauswahl und Termin.
- **Serie ist nur ein Schalter.** Dieselbe Maschinerie erzeugt statt einem Post eine Kampagne — kein zweites Werkzeug mit eigener Logik.
- **Coach wird nützlich.** Feedback zu genau dem Text, der gerade auf dem Schirm ist, statt einer leeren Chatseite.
- **Vorlagen entstehen nebenbei.** Was gut war, wird an Ort und Stelle gesichert und beim nächsten Briefing angeboten.
- **Ein Ausgang.** Die vorhandene Aktionsleiste (Herunterladen · Jetzt veröffentlichen · Einplanen) übergibt in das Content Command Center.

## Visuell

- Bond-Gold, kinematisch: Kopfbereich mit Playfair-Display-Titel, darunter ein schlankes Fortschrittsband mit goldener Fortschrittslinie und Häkchen für erledigte Schritte.
- Zweispaltiges Arbeitsbild: links der aktive Schritt, rechts eine dauerhaft mitlaufende Live-Vorschau des Beitrags (Format wechselt mit der Plattform).
- Schrittwechsel als weiches Überblenden, ausgewählte Karten zoomen in die Arbeitsfläche statt hart zu springen.
- Coach als Panel von rechts, glasig, mit goldenem Rand — überlagert nie die Vorschau.
- Der Hub "Optimieren" bekommt eine breite Hauptkarte mit vier Vorschaufeldern (wie "Planen" → Content Command Center).

## Technische Umsetzung

**Neue Dateien**
- `src/pages/ContentStudio.tsx` — Schritt-Shell, `?step=` Deep-Link, Fortschrittsband, zweispaltiges Layout mit Live-Vorschau.
- `src/contexts/ContentStudioContext.tsx` — der eine Entwurfszustand: `brief` (Thema, Ziel, Plattformen, Tonalität, Brand-Kit), `copyVariants` + `selectedCopy`, `image` (Quelle, URL, Prompt), `design` (Post-Designer-Slides), `mode: "single" | "series"`, `templateId`. Persistenz in `sessionStorage`, harter Reset bei "Neues Projekt".
- `src/components/content-studio/steps/BriefStep.tsx`, `CopyStep.tsx`, `MotifStep.tsx`, `LayoutStep.tsx`, `DeliverStep.tsx`.
- `src/components/content-studio/TemplateDrawer.tsx` — Laden/Speichern gegen die vorhandene Vorlagen-Tabelle aus `TemplateManager.tsx`.
- `src/components/content-studio/CoachPanel.tsx` — Sheet, füttert die vorhandene Coach-Logik mit `brief` + `selectedCopy`.

**Wiederverwendung statt Neuschreiben**
- Copy-Erzeugung: bestehende Edge Function aus `AIPostGenerator.tsx` (Aufruf umziehen, Funktion unverändert).
- Motiv + Layout: Logik aus `PostDesigner.tsx` wird in `src/lib/post-design/` bzw. wiederverwendbare Komponenten ausgelagert (`VariantGallery`, `SlideRenderer`, `imagePrompt.ts`, `detectImageText.ts` bleiben unverändert). `PostDesigner.tsx` wird zur dünnen Hülle um `LayoutStep`.
- Paarungsbewertung: Score-Logik aus `ImageCaptionPairing.tsx` nach `src/lib/content-studio/pairingScore.ts` heben und im Motiv-Schritt als Passungs-Hinweis anzeigen.
- Serien: Kampagnen-Erzeugung aus `Campaigns.tsx` in `src/lib/content-studio/series.ts`; erzeugt N Entwürfe aus dem Briefing plus Terminvorschläge über die bestehende Bestzeit-Empfehlung.
- Ausgabe: vorhandene `ExportActionBar` + `useQuickPublish`, für Serien mit Mehrfach-Einplanung in den Kalender.

**Routen & Aufräumen**
- Neu: `/content-studio` (+ `?step=`, `?coach=1`).
- Redirects mit Erhalt von Query/State über eine `ContentStudioRedirect`-Komponente (Muster aus `CommandCenterRedirect.tsx`): `/ai-post-generator` → `?step=brief`, `/image-caption-pairing` → `?step=motif`, `/template-manager` → `?templates=1`, `/campaigns` → `?step=deliver&mode=series`, `/coach` → `?coach=1`, `/post-designer` → `?step=layout`.
- Löschen: `src/pages/CommentManager.tsx`, `src/components/comments/CommentManagerHeroHeader.tsx`, Route in `App.tsx`, Einträge in `src/config/hubConfig.ts` und `src/components/ui/CommandBar.tsx`. Datenbank und Analytics-Kommentaransicht bleiben unangetastet.
- Alte Seiten `AIPostGenerator.tsx`, `ImageCaptionPairing.tsx`, `TemplateManager.tsx`, `Campaigns.tsx`, `Coach.tsx` werden nach dem Herauslösen der Logik entfernt.
- `hubConfig.ts`: "Optimieren" bekommt eine `wide`-Hauptkarte mit `previews`.
- Übersetzungen: neuer `cs.*`-Namensraum in EN/DE/ES; `nav.commentManager` und Begleittexte entfernen.

**Umsetzungsreihenfolge**
1. Kontext + Shell + Fortschrittsband (leere Schritte)
2. Briefing + Copy (Post-Generator abgelöst)
3. Motiv + Layout (Post Designer eingezogen, Pairing-Score integriert)
4. Vorlagen-Schublade + Coach-Panel
5. Ausspielen inkl. Serien-Schalter, danach Routen/Aufräumen
