---
name: Briefing-Blocklabels sind keine Sprecher (v420)
description: Warum die Sprecher-Zuordnung leer blieb — DAUER/ORT/CAST/AKTION wurden als Dialog-Turns geparst; Filter + Ensemble-Mindestbesetzung
type: feature
---

# v420 — Strukturlabels vs. Sprecher

- Ursache des Dauerfehlers "Sprecher-Zuordnung offen": Der Script-Timing-Detektor las jede `LABEL: Text`-Zeile als Sprecherzeile. Aus `DAUER:`, `ORT:`, `CAST:`, `AKTION:`, `STIMME:`, `UNTERTITEL:`, `NEGATIVE-PROMPT:` wurden Dialog-Turns (`@dauer`, `@ort`, …). Die clientseitige Auto-Besetzung filterte sie korrekt weg — es blieb also nichts Echtes zum Binden.
- Fix: `isNonSpeakerLabel()` in `supabase/functions/_shared/briefing/deep/detectScriptTimingMode.ts` (DE/EN/ES-Blockschlüssel, normalisiert). Wird im Shot-Marker-Parser, im Named-Speaker-Parser und in der `dialogTurns`-Sanitize von `deep/index.ts` angewendet.
- Ensemble-Mindestbesetzung (`deep/index.ts`, nach `enforceStrictCast`): Wählt das Briefing N Cast-&-World-Figuren, wird jede Szene mit ≥2 Slots auf min(N, 4) aufgefüllt — Solo-Szenen bleiben solo.
- Client (`ProductionPlanSheet.tsx`): `isRealSpeakerTurn` steuert Warnfeld und den Zähler "N Dialogzeilen übernehmen"; Blocklabels werden nicht mehr gezählt.
- Test: `src/lib/video-composer/__tests__/briefingStructureLabels.test.ts`.
