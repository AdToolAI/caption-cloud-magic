

## Befund

Der User möchte die Hinweise **aufteilen**:
- **Briefing-Tab:** nur die **rechtlichen** Hinweise (verbotene Inhalte, Konsequenzen, Verantwortung) — rote/destruktive Sektion mit `ShieldAlert`
- **Storyboard-Tab:** nur die **technischen KI-Generierungs-Hinweise** (Prompt-Qualität, Personen-Konsistenz, Credits) — goldene Sektion mit `Sparkles`

Aktuell stecken **beide** Sektionen zusammen im Briefing-Tab. Storyboard hat keinen Block.

## Plan

### 1. `BriefingTab.tsx` — nur rechtliche Sektion behalten
- Komplette **technische Sektion** (gold, Sparkles, Prompt/Personen/Credits) entfernen
- Block-Header von "Wichtige Hinweise zur AI-Generierung" auf `aiLegalTitle` ("Nutzungsrichtlinien & verbotene Inhalte") umstellen
- Header-Icon von `Sparkles` (gold) auf `ShieldAlert` (destruktiv/rot) tauschen
- Linker Akzent-Strich + Border auf destruktive Farbe (`border-destructive/20`, Akzent rot statt gold) anpassen
- Collapse-Logik + `localStorage`-Key bleiben (`video-composer-briefing-tips-collapsed`)
- Innere Trennlinie zwischen Sektionen entfernen — nur noch eine Sektion vorhanden

### 2. `StoryboardTab.tsx` — neue technische Sektion einfügen
- Direkt **unter der Summary-Bar**, über den Szenenkarten
- Goldener James-Bond-2028-Stil: Glasmorphismus, linker goldener Akzent-Strich, `Sparkles`-Icon
- Header: `aiTipsTitle` ("Wichtige Hinweise zur AI-Generierung")
- Drei Bullet-Points: `aiTipPrompt`, `aiTipPersons`, `aiTipCredits` (gold-Akzent-Punkte)
- Collapse-Toggle (Chevron-Up/Down) + neuer `localStorage`-Key: `video-composer-storyboard-tips-collapsed`
- Standardmäßig **aufgeklappt**
- **Immer sichtbar** (nicht abhängig von AI-Szenen) — Nutzer sieht Hinweise vor erster Szene

### 3. `src/lib/translations.ts`
Keine Änderung nötig — alle Keys (`aiTipsTitle`, `aiTipPrompt`, `aiTipPersons`, `aiTipCredits`, `aiTipsCollapse`, `aiTipsExpand`, `aiLegalTitle`, `aiLegalProhibited`, `aiLegalConsequences`, `aiLegalResponsibility`) existieren bereits in DE/EN/ES.

## Geänderte Dateien
- `src/components/video-composer/BriefingTab.tsx` — technische Sektion entfernen, Header/Icon/Farben auf rechtlich umstellen
- `src/components/video-composer/StoryboardTab.tsx` — goldener technischer Hinweis-Block unter Summary-Bar einfügen

## Verify
- Briefing-Tab: oben **nur** rote rechtliche Sektion mit `ShieldAlert`-Header, kollabierbar
- Storyboard-Tab: unter Summary-Bar **nur** goldene technische Sektion mit `Sparkles`-Header, kollabierbar
- Beide Collapse-States unabhängig, Persistenz nach Reload korrekt
- Sprachen DE/EN/ES korrekt

