# Content Studio: fünf Optimieren-Features zu einem Werkzeug

Der Hub "Optimieren" besteht heute aus sechs einzelnen Seiten, die alle dieselbe Aufgabe umkreisen: aus einer Idee einen fertigen Beitrag machen. Sie sind aber vollständig getrennt — jede Seite hat eigenen Einstieg, eigenen Kontext, kein Ergebnis wandert weiter. Der Kommentar-Manager gehört inhaltlich nicht dazu und existiert bereits in Analytics.

## Entscheidung

- **Löschen**: KI Kommentar-Manager (Duplikat zu Analytics/Kommentare).
- **Zusammenführen** in ein Feature **"Content Studio"** unter `/content-studio`:
  1. KI Post-Generator
  2. Bild-Text-Pairing
  3. Vorlagen-Manager
  4. Kampagnen-Assistent
  5. KI-Coach

Der Hub "Optimieren" zeigt danach eine breite Hauptkarte (wie "Planen" → Content Command Center) mit vier Vorschaufeldern.

## Aufbau des Content Studios

Eine Shell mit Tabs, gleiche Bauweise wie das Content Command Center (Tabs, Deep-Links, Ansichten bleiben beim Wechsel erhalten):

```text
Content Studio
├─ Entwerfen   → Post-Generator + Post Designer (Text, Bild, Layout)
├─ Paaren      → Bild-Text-Pairing (Motiv ↔ Caption)
├─ Vorlagen    → Vorlagen-Manager (speichern, wiederverwenden)
├─ Kampagnen   → Kampagnen-Assistent (Serien statt Einzelposts)
└─ Coach       → KI-Coach als Seitenpanel, immer erreichbar
```

Der Coach bekommt keinen eigenen Tab, sondern ist ein aufklappbares Panel am rechten Rand, das den aktuellen Entwurf kennt und dazu Feedback gibt. Das ist der eigentliche Mehrwert: Rat genau dort, wo der Text entsteht — nicht auf einer separaten Seite ohne Kontext.

## Der Mehrwert: Dinge wandern weiter

Heute endet jedes Tool in einer Sackgasse. Neu:

- **Entwerfen → Vorlagen**: "Als Vorlage sichern" direkt aus dem Entwurf.
- **Vorlagen → Entwerfen**: "Vorlage verwenden" öffnet den Entwurf vorbefüllt.
- **Paaren → Entwerfen**: gewähltes Bild-Text-Paar wird zum Entwurf.
- **Entwerfen/Kampagnen → Veröffentlichen**: die bestehende Export-Aktionsleiste (Herunterladen · Jetzt veröffentlichen · Einplanen) übernimmt in das Content Command Center.
- **Kampagnen → Kalender**: eine erzeugte Kampagnenserie landet als Terminvorschläge im Kalender.

Ein gemeinsamer Studio-Zustand (aktueller Entwurf: Thema, Copy, Bild, Plattformen, Marke) hält die Tabs zusammen, statt jedem Tab eigene Eingaben zu geben.

## Visuell

- Kinematischer Kopfbereich im Bond-Gold-Stil: Titel in Playfair Display, darunter eine Statuszeile mit dem aktiven Entwurf (Thema-Chip, Markenfarbe, Zielplattformen).
- Tabs als goldumrandete Segmentleiste mit ruhigem Glow, wie im Content Command Center.
- Der Entwurf bleibt als schmale Vorschaukarte oben rechts sichtbar, egal in welchem Tab — dadurch wirkt es wie ein Werkzeug, nicht wie vier Seiten hintereinander.
- Übergänge zwischen Tabs faden, kein harter Sprung.

## Abgrenzung zu Kampagnen im Command Center

Im Command Center bezeichnet "Kampagnen" die Planungsansicht bestehender Kampagnen (Zeitachse, Status). Der Kampagnen-Assistent hier erzeugt sie. Beide bleiben, werden aber gegenseitig verlinkt: nach dem Erzeugen führt eine Schaltfläche direkt in die Planungsansicht.

## Technische Umsetzung

- Neu `src/pages/ContentStudio.tsx`: Shell nach dem Muster von `CommandCenter.tsx` — `VIEWS = ["compose","pair","templates","campaigns"]`, ARIA-Tabs mit Pfeiltasten, `KeepAlive`, `?view=` Deep-Link.
- Neu `src/contexts/ContentStudioContext.tsx`: gemeinsamer Entwurfszustand (`topic`, `copy`, `hashtags`, `imageUrl`, `platforms`, `templateId`), plus `applyFromTemplate`, `saveAsTemplate`.
- Bestehende Seiten bekommen wie bei Command Center einen `embedded`-Prop (Kopf/Seiten-Chrome aus): `AIPostGenerator.tsx`, `ImageCaptionPairing.tsx`, `TemplateManager.tsx`, `Campaigns.tsx`. Keine Logik-Umschreibung, nur Chrome und Anbindung an den Kontext.
- `Coach.tsx` wird zu `ContentCoachPanel` (Sheet rechts) umschlossen; die Seitenlogik bleibt, Eingabe wird mit dem aktuellen Entwurf vorbelegt. Route `/coach` bleibt als Redirect auf `/content-studio?coach=1`.
- Löschen: `src/pages/CommentManager.tsx`, `src/components/comments/CommentManagerHeroHeader.tsx`, Route in `App.tsx` (zwei Stellen), Eintrag in `src/config/hubConfig.ts`, Eintrag in `src/components/ui/CommandBar.tsx`. Datenbank und Analytics-Kommentaransicht bleiben unangetastet.
- Redirects wie bei Command Center über eine `ContentStudioRedirect`-Komponente, damit Query-Parameter und State erhalten bleiben (`/ai-post-generator` → `/content-studio?view=compose` usw.).
- `hubConfig.ts`: "Optimieren" bekommt eine `wide`-Hauptkarte mit `previews` für die vier Ansichten.
- Übersetzungen: neuer `cs.*`-Namensraum in `src/lib/translations.ts` (EN/DE/ES); `nav.commentManager` und zugehörige Beschreibungen entfernen.
- Export-Anbindung über die vorhandene `ExportActionBar` / `useQuickPublish`.
