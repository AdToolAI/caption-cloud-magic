## Status Briefing-Pipeline

Kernpipeline ist stabil. Server ist Autorität (`briefing_contract` mit Clamping v215), Client zieht den Contract vor eigener Detektion, `finalizePlanCanonical` blockt inkonsistente Pläne, Ensemble-Leaks/Cast-Dedup/Voice-Binding/UUID-Guards sind drin, 13/13 Tests grün, Typecheck grün.

Für den Beta-Launch ist damit **nichts Kritisches mehr offen**. Was noch übrig ist, ist reine Refactor-Hygiene ohne Nutzerimpact — kann warten:

### Optional (kein Blocker)

- **Phase 4** — `ProductionPlanSheet` entkernen: `safePlan`/`useMemo` raus, Finalize nur beim Empfang + im Apply-Guard. UX-Gewinn bei Edits (kein Cursor-Springen), aber invasiv.
- **Phase 5** — Apply-Pfad vereinheitlichen: `useApplyProductionPlan` + `useStoryboardTransition` teilen sich einen `applyPlanToStoryboard`-Helper mit dem Finalize-Guard.
- **Phase 7** — `BriefingTab` auf einen einzigen Edge-Function-Pfad (`briefing-deep-parse`), Legacy-Fallback nur bei 5xx.

### Empfehlung

Für den Beta-Launch **liegen lassen**. Erst anfassen, wenn a) ein konkreter UX-Bug aus dem Sheet gemeldet wird oder b) nach dem Launch ein Refactor-Fenster frei ist. Vorher noch Golden-Files (Phase 9 Rest) anlegen, damit Phase 4 nicht regressiert.

Sag „Phase 4 starten", wenn ich das Sheet trotzdem jetzt umbauen soll — sonst ist die Pipeline aus meiner Sicht launch-fertig.
