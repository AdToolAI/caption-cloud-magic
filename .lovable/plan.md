# Ehrliche Bewertung: Content Command Center

Kurz: visuell ja, logisch noch nicht ganz. Die Zusammenführung sieht sauber aus und funktioniert im Normalfall, aber es gibt einen echten Regressions-Punkt bei Deep-Links sowie mehrere Sauberkeits-Themen (Übersetzungen, Design-Tokens, Barrierefreiheit).

## Was gut ist

- Ein Hub-Einstieg, vier Ansichten, URL-gesteuert (`?view=…`) — teilbar und zurück-Button-fähig.
- Bestehende Seiten werden über `embedded` wiederverwendet statt dupliziert.
- Composer als Vollbild-Ebene, Zeitempfehlungen direkt im Planungsdialog.

## Was noch nicht sauber ist

### 1. Deep-Links verlieren Parameter (echter Fehler, höchste Priorität)
Die Weiterleitungen von `/calendar`, `/planner`, `/composer`, `/posting-times` zeigen auf feste Ziele. Alles, was ein aufrufender Bildschirm mitgibt, geht verloren:
- `/calendar?prefill=true` (Mediathek, KI-Post-Generator, Bild-Caption) — der Kalender liest diesen Parameter aus, er kommt nicht mehr an.
- `?preset_weekday` / `?preset_hour` aus „Beste Zeiten“ — Terminvorschlag landet nicht mehr im Kalender.
- Übergebene Navigations-Zustände (z. B. aus Dashboard-Wochenplan, Top-Slots-Liste) werden verworfen.

Fix: eine kleine Weiterleitungs-Komponente, die Query-Parameter und Navigations-Zustand unverändert an `/command-center` durchreicht.

### 2. Texte doppelt gepflegt
Die Beschriftungen des Command Centers liegen als eigener Block in der Seite statt in der zentralen Übersetzungsdatei. Die vier Vorschau-Kacheln im Hub („Kalender“, „Beiträge“, „Kampagnen“, „Beste Zeiten“) sind fest auf Deutsch — englische und spanische Nutzer sehen deutsche Labels.

### 3. Farben fest verdrahtet statt Design-Tokens
Header-Verlauf, Glow und aktiver Tab nutzen feste Goldwerte. Im hellen Modus ist die Primärfarbe im Projekt eine andere — dort passt die Optik nicht. Es gibt bereits passende Tokens (`--gradient-gold`, `--shadow-glow-gold`, `--primary`), die stattdessen verwendet werden sollten.

### 4. Barrierefreiheit
- Die Composer-Ebene hat keinen echten Dialog-Titel — Screenreader-Warnung, Titel wird nicht angesagt.
- Der Ansichts-Umschalter ist eine Reihe einfacher Schaltflächen ohne Tab-Semantik und ohne Pfeiltasten-Navigation; das gesetzte `aria-current` ist an dieser Stelle nicht korrekt.

### 5. Zustand geht beim Tab-Wechsel verloren
Beim Umschalten wird die Ansicht komplett abgebaut: Filter, Scrollposition und Monatsauswahl im Kalender sind danach zurückgesetzt. Für ein „Command Center“ erwartet man, dass man zwischen Ansichten hin- und herspringen kann, ohne den Kontext zu verlieren.

### 6. Kleinigkeiten
- Die Schnellsuche (Cmd+K) zeigt weiter den alten Kalender-Eintrag; besser direkt auf die Command-Center-Ansicht zeigen, damit die Markierung stimmt.
- Nach erfolgreichem Anlegen eines Posts schließt sich die Composer-Ebene nicht automatisch.
- Vorbestehend, unabhängig von dieser Umstellung: `/calendar/templates` wird an zwei Stellen angesteuert, existiert aber nicht als Route.

## Umsetzungsplan

1. **Deep-Link-Weiterleitung reparieren** — `CommandCenterRedirect`-Komponente mit Ziel-Ansicht als Prop; hängt vorhandene Query-Parameter an und reicht den Navigations-Zustand weiter. Ersetzt die vier festen Weiterleitungen in `src/App.tsx`.
2. **Texte zentralisieren** — Command-Center-Labels und Vorschau-Kachel-Beschriftungen in `src/lib/translations.ts` (DE/EN/ES); lokaler Text-Block entfällt, Hub-Kacheln bekommen Übersetzungsschlüssel statt fester Strings.
3. **Design-Tokens statt Festwerte** — Header, Tab-Leiste und Hub-Karte auf `--gradient-gold`, `--shadow-glow-gold` und `primary`-Klassen umstellen; auf hellen Modus prüfen.
4. **Barrierefreiheit** — echter (visuell versteckter) Dialog-Titel plus Beschreibung für die Composer-Ebene; Umschalter mit `role="tablist"`/`role="tab"`, `aria-selected` und Pfeiltasten-Navigation.
5. **Zustand erhalten** — die vier Ansichten gemountet halten und inaktive nur ausblenden, damit Filter und Scrollposition erhalten bleiben; Erst-Ladung weiterhin lazy pro Ansicht.
6. **Feinschliff** — Schnellsuche auf `/command-center?view=calendar` umbiegen, Composer-Ebene nach erfolgreicher Planung schließen und die Kalenderansicht aktualisieren.
7. **Prüfen** — Typecheck, Lint sowie Browser-Durchlauf: Deep-Link mit `prefill`, Zeitvorschlag aus „Beste Zeiten“ in den Kalender, Tab-Wechsel mit gesetzten Filtern, heller Modus.

## Technische Details

- `src/App.tsx`: vier `Navigate`-Einträge durch `<CommandCenterRedirect view="…" />` ersetzen (`useLocation` + `useSearchParams`, `state` durchreichen).
- Neu: `src/components/routing/CommandCenterRedirect.tsx`.
- `src/pages/CommandCenter.tsx`: `COPY` entfernen, `t()` verwenden; Tabs als Tablist; Ansichten in dauerhaft gemounteten Containern mit `hidden`-Umschaltung; `DialogTitle`/`DialogDescription` via `sr-only`.
- `src/config/hubConfig.ts`: `previews[].label` → `labelKey` mit Übersetzung im Renderer.
- `src/pages/HubPage.tsx`: Token-Klassen statt Inline-`hsla`, `labelKey` übersetzen.
- `src/components/CommandPalette.tsx`: Route des Kalender-Eintrags aktualisieren.
