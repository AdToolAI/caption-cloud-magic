---
name: Briefing-Übernahme v414
description: Dialogzeilen-Übernahme ins Storyboard (opt-out), kein Parallel-Fire mehr in der Deep-Analyse
type: feature
---

# Briefing → Storyboard, v414

- **Dialogzeilen werden übernommen** (revidiert v229): `useApplyProductionPlan` baut `dialogTurns` aus `plan.scenes[].dialogTurns`, aber nur wenn der Sprecher auf eine Charakter-UUID auflösbar ist (direkt über `speakerCharacterId` oder über den Cast-Slot des `mentionKey`). Zeilen ohne auflösbaren Sprecher werden verworfen — genau die Meta-Zeilen-Fragilität, die zu v229 führte.
- Gesteuert über `applyDialogTurns` in `ApplyPlanArgs`; das ProductionPlanSheet zeigt „N Dialogzeilen übernehmen" als Checkbox (Default an) und blendet sie aus, wenn der Plan keine Zeilen enthält.
- **Parallel-Fire entfernt** (`useStoryboardTransition`): Der zweite identische Deep-Parse-Request nach 700 ms lief faktisch immer und verdoppelte Modellkosten. Jetzt ein Request pro Versuch; die bestehende Retry-Schleife (Netzfehler, 502/503/504) bleibt.
- Voice-Binding und `dialogScript` bleiben weiterhin leer — Stimmen wählt der Kunde manuell im Dialog-Studio.
- Test: `src/hooks/__tests__/useApplyProductionPlan.test.ts` (Plan → Szenen Snapshot inkl. Dialogzeilen-Gate).
