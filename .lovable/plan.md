

## Befund

Der User möchte den AI-Hinweisblock (technische Tipps + rechtliche Nutzungsregeln) **nicht** im Storyboard-Tab pro Szene, sondern **prominent oben im Briefing-Tab** platzieren. Das macht Sinn:

- Briefing ist der **erste** Tab, den jeder Nutzer sieht
- Hinweise erscheinen **einmalig** vor jeglicher Generierung
- Logischer Flow: erst Regeln lesen → dann Modus/Kategorie wählen → dann Storyboard

Aktueller Stand:
- `StoryboardTab.tsx` enthält den kombinierten goldenen Hinweis-Block (collapse via `localStorage`)
- `BriefingTab.tsx` (vermutlich) hat oben "Modus" und "Kategorie" Sektionen, aber **keinen** Hinweisblock
- Rechtliche Sektion (verbotene Inhalte, Konsequenzen) wurde noch nicht implementiert

## Plan

### 1. Hinweis-Block aus `StoryboardTab.tsx` entfernen
Den kompletten goldenen Hinweis-Block (inkl. `tipsCollapsed` State + `localStorage`-Logik + `Sparkles`/`ChevronDown`/`ChevronUp` Imports) entfernen. Storyboard bleibt aufgeräumt mit nur Summary-Bar + Szenenkarten.

### 2. Neuen kombinierten Hinweis-Block in `BriefingTab.tsx`
Ganz **oben im Briefing-Tab** (vor "Modus"-Sektion) den Block einfügen — gleicher James-Bond-2028-Stil:
- Glasmorphismus + linker goldener Akzent-Strich
- Header: `Sparkles`-Icon + "Wichtige Hinweise zur AI-Generierung"
- Kollabierbar via `localStorage` (Key: `video-composer-briefing-tips-collapsed`)

**Inhalt** (zwei Sektionen, optisch getrennt):

**A) Technische Tipps (gold-Akzente):**
1. **Prompt-Qualität:** Präzise Prompts liefern bessere Ergebnisse
2. **Personen-Konsistenz:** AI-Personen können zwischen Szenen variieren
3. **Credits-Verbrauch:** Credits werden sofort beim Generieren abgebucht — auch bei nicht passendem Ergebnis

**B) Rechtliche Nutzungsregeln (rote/destruktive Akzente, mit `ShieldAlert`-Icon + dünner Trennlinie davor):**
1. **Strikt verboten:** Pornografische, sexuell explizite, gewaltverherrlichende, hasserfüllte, diskriminierende, illegale Inhalte sowie Deepfakes ohne Einwilligung und CSAM
2. **Konsequenzen:** Verwarnung → temporäre Sperre → permanente Account-Löschung (ohne Credit-Rückerstattung), je nach Schwere
3. **Verantwortung:** Nutzer ist rechtlich verantwortlich; bei schweren Verstößen Behörden-Meldung (z. B. NCMEC)

### 3. Lokalisierung (`src/lib/translations.ts`)
Bestehende Keys umziehen + neue ergänzen unter `videoComposer.*` (DE/EN/ES):
- Bestehende `aiTipsTitle`, `aiTipPrompt`, `aiTipPersons`, `aiTipCredits`, `aiTipsCollapse`, `aiTipsExpand` bleiben → werden nur in `BriefingTab` statt `StoryboardTab` genutzt
- Neue Keys: `aiLegalTitle`, `aiLegalProhibited`, `aiLegalConsequences`, `aiLegalResponsibility`

### 4. Bedingung
Im Briefing-Tab **immer** anzeigen (nicht abhängig von AI-Szenen) — denn der Nutzer wählt erst hier den Modus. Block ist standardmäßig **aufgeklappt**, kann via `localStorage` weggeklappt werden.

## Geänderte Dateien
- `src/components/video-composer/BriefingTab.tsx` — neuer Hinweis-Block oben (technische + rechtliche Sektion, kollabierbar)
- `src/components/video-composer/StoryboardTab.tsx` — alten Hinweis-Block + zugehörige Imports/State entfernen
- `src/lib/translations.ts` — neue rechtliche Keys ergänzen (`aiLegalTitle`, `aiLegalProhibited`, `aiLegalConsequences`, `aiLegalResponsibility`) in DE/EN/ES

## Verify
- Briefing-Tab: Ganz oben erscheint **ein** eleganter Hinweis-Block mit zwei Sektionen (gold = Tipps, rot = Recht)
- Klick auf Header → kollabiert/expandiert, Status persistent nach Reload
- Storyboard-Tab: kein Hinweis-Block mehr, nur Summary + Szenenkarten
- Sprachen DE/EN/ES korrekt
- Verboten-Liste, Konsequenzen und Verantwortung sind klar erkennbar (rotes Schild-Icon)

