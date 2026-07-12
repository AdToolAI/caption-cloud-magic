## Problem
Im AI Video Studio (`ToolkitGenerator.tsx`) ist der Prompt reiner React-State (`useState('')`). Beim Verlassen der Seite (Route-Wechsel) wird die Komponente unmounted und das eingetragene Briefing geht verloren.

## Fix
Prompt-Text in `localStorage` persistieren — analog zu den bereits vorhandenen Draft-Patterns im Projekt (`universal-video-draft.ts`).

### Änderungen in `src/components/ai-video/ToolkitGenerator.tsx`
1. Storage-Key definieren: `ai-video-toolkit:prompt-draft`
2. `useState('')` durch Lazy-Initializer ersetzen, der aus `localStorage` liest.
3. `useEffect` hinzufügen, das bei jeder Änderung von `prompt` den Wert (debounced, ~300ms) in `localStorage` schreibt. Bei leerem String → Key entfernen.
4. Nach erfolgreicher Generierung (Ende von `handleGenerate`) den Draft **nicht** automatisch löschen — der Nutzer soll den Prompt für Iterationen behalten. Optional: kleiner „Prompt zurücksetzen"-Button (nicht Teil dieses Fixes, falls nicht gewünscht).

### Scope-Grenzen
- Nur `prompt` wird persistiert. Modell, Cast-Auswahl, Aspect Ratio etc. bleiben unverändert (kein Feature-Creep).
- Motion Studio, Picture Studio, Universal Creator werden nicht berührt.
- Keine Backend-Änderungen.

## Test
1. Prompt eintragen → Sidebar-Route wechseln → zurück ins AI Video Studio → Prompt ist erhalten.
2. Reload der Seite → Prompt ist erhalten.
3. Prompt leeren → LocalStorage-Key ist entfernt.
