# Arbeitsmodi entfernen — Briefing immer im vollen Studio-Umfang

## Ausgangslage (geprüft)

Im Briefing-Tab rendern bereits **alle** Panels unabhängig vom gewählten Modus: Kategorie, Produkt/Service, Stil & Format, Video-Modus, Cast & World (CharacterManager), Sprecher-Zuordnung, Director's Note, Visueller Stil, Marken-Kit und Stock-First stehen ohne Bedingung im Markup. Der Umschalter Quick/Direct/Studio ändert nur einen gespeicherten Wert und löst eine Crossfade-Animation aus — inhaltlich passiert nichts.

Genau das erklärt den gemeldeten Bug: Die UI ändert sich beim Umschalten nicht, weil es nichts zu ändern gibt. Der Umschalter verspricht eine Abstufung, die es im Code nicht gibt.

## Ziel

Die Modus-Umschalter komplett entfernen. Jeder Nutzer sieht immer das vollständige Studio-Briefing; die Briefing-Analyse übernimmt weiterhin die Automatik (Szenen, Sprecher, Dauer, Provider-Wahl).

## Umsetzung

1. **Umschalter im Briefing-Tab entfernen** — die sticky Leiste „Arbeitsmodus" mit den drei Buttons fällt weg. Der Crossfade-Wrapper wird zum normalen Container ohne Modus-Key, damit die Seite beim Tippen nicht neu animiert.
2. **Umschalter in der Director-Bar entfernen** — die Chips QUICK / DIRECT / STUDIO oben rechts verschwinden. Ambient-Audio und Cinemascope bleiben unverändert.
3. **Preferences aufräumen** — `editorMode`, `editorModeManual`, `setEditorMode` und `suggestEditorMode` werden aus den Studio-Preferences entfernt; die automatische Modus-Empfehlung nach der Plan-Anwendung entfällt ersatzlos. Bereits gespeicherte Alt-Werte im Browser werden beim Laden ignoriert, ohne Fehler zu werfen.
4. **Rest unverändert** — Audio-Modus, Cinemascope und die Scoping-Logik pro Nutzer bleiben genau wie sie sind.

## Technische Details

- `src/components/video-composer/BriefingTab.tsx`: Modus-Leiste (ca. Z. 537–555) löschen, `key={editorMode}` und die `useStudioPreferences`-Nutzung für den Modus entfernen.
- `src/components/video-composer/stage/DirectorBar.tsx`: `ModeSwitch` samt Import und `setEditorMode` entfernen.
- `src/hooks/useStudioPreferences.ts`: `EditorMode`-Typ, Felder, Setter und `suggestEditorMode` entfernen; Parser toleriert unbekannte Alt-Felder.
- `src/hooks/useApplyProductionPlan.ts`: Aufruf von `suggestEditorMode` entfernen.
- Ergebnis prüfen: TypeScript-Check muss ohne Restreferenzen auf `editorMode` durchlaufen.

## Nicht Teil dieser Änderung

Keine Änderung an Briefing-Analyse, Storyboard, Provider-Wahl oder Lip-Sync-Kette.
