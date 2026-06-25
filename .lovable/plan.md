## Problem

1. **Production-Plan-Sheet wird unten abgeschnitten**, weil der `ScrollArea`-Viewport im Flex-Container kein `min-h-0` hat und die einzelnen Szenen-Karten zu viel Padding/Höhe pro Block belegen.
2. **Skript landet auf Englisch**, obwohl das Briefing in Deutsch verfasst wurde. Der Edge-Function-Aufruf `briefing-deep-parse` bekommt aktuell kein `language`-Feld, deshalb interpretiert Gemini "briefing's language" inkonsistent — bei strukturiertem Briefing mit englischen Header-Labels (Cast/Project) springt das Modell auf EN.

## Fix

### A) UI passt jetzt auf eine Seite (scrollbar)

**`src/components/video-composer/briefing/ProductionPlanSheet.tsx`**
- `DialogContent`: `max-w-4xl max-h-[88vh]` (statt 5xl/92vh) + `p-4` für kompakteres Padding.
- `DialogHeader/Description` enger setzen (Description einzeilig, kleinere `text-xs`).
- ScrollArea: `flex-1 min-h-0 pr-3` — `min-h-0` ist der entscheidende Fix, damit der Viewport seinen Inhalt scrollen lässt statt das Dialog zu sprengen.
- Szenen-Karte komprimieren:
  - Director's Vision: `max-h-20 overflow-hidden` mit "Mehr anzeigen"-Toggle pro Szene.
  - Performance + Plan-Extras in eine einzige flex-wrap-Reihe statt zwei Blöcke.
  - Cast/Engine/Duration als 3-Spalten-Grid (statt einzelne volle Zeilen).
  - Padding `p-2` statt `p-3`, `space-y-1.5`.
- `SectionCard`: dünner Header (`text-xs uppercase`), `p-2`.

### B) Sprache wird durchgereicht und im Prompt erzwungen

**`src/components/video-composer/briefing/ProductionPlanSheet.tsx`**
- `invoke('briefing-deep-parse', { body: { briefing, projectId, language } })` — `language` Prop ist bereits da.

**`src/hooks/useStoryboardTransition.ts`**
- Hook-Args um `language: string` erweitern.
- An `supabase.functions.invoke('briefing-deep-parse', { body: { briefing: text, projectId, language } })` weiterreichen.

**`src/components/video-composer/VideoComposerDashboard.tsx`**
- `useStoryboardTransition({ …, language: project.language })`.

**`supabase/functions/briefing-deep-parse/index.ts`**
- Body um `language` parsen (Default `'de'`).
- Pass-A-System-Prompt erweitern um Hard-Rule (vor "AUTO-DIRECTOR MODE"):
  ```
  LANGUAGE LOCK — output language: ${language.toUpperCase()}
  ALL human-readable text fields MUST be written in ${language}:
    - scenes[*].voiceover.text
    - scenes[*].dialogTurns[*].text
    - scenes[*].label, scenes[*].beat
    - scenes[*].performance.{mimik,gestik,blick}
  ENGLISH-ONLY fields (visual prompts for AI models):
    - scenes[*].anchorPromptEN
    - scenes[*].brollHints
  This rule overrides any English wording inside the briefing's
  scaffolding (## Cast, ## Project headers etc.).
  ```
- Gleiche Regel kurz in Pass B nochmal pinnen, damit Resolver Captions/Highlight-Words nicht ins EN dreht.

## Sicherheits-Check (unverändert)

- Keine Änderung an `compose-dialog-segments` (v169-Pipeline) oder an `useApplyProductionPlan` an der Stelle, wo Voice-IDs / Anker resolvet werden.
- `anchorPromptEN` und `brollHints` bleiben Englisch — entspricht Project-Memory-Regel "Visual prompts for AI models MUST remain in English".
- Sprache wird **nur** als Hint übergeben, keine Voice-ID-Übersteuerung — Voice-Resolver bleibt unangetastet.

## Validierung

- Sheet einmal mit langem Plan (5 Szenen, alle Felder gesetzt) öffnen → kein Cutoff, "Plan anwenden" sichtbar, innen scrollbar.
- Deutsches Briefing → Pass A liefert `voiceover.text` auf Deutsch, `anchorPromptEN` auf Englisch.
- Englisches Briefing (`language: 'en'`) → alles EN wie vorher.
