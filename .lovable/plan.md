# Status: Fix-Bundle G — Rest-Arbeiten

## Was schon läuft (letzter Turn)
- **G1 revidiert** — `detectScriptTimingMode` erkennt Top-Level `SZENE N` als eigene Szene, Sub-Shots (1A/1B) landen als `dialogTurns` in der Elternszene.
- **G2** — Szenenanzahl = Top-Level-Marker (3 Szenen statt 6 bei Testfall).
- **G3** — Duration Auto-Extend (`max(sollzeit, speechSec+1s)`) im Edge-Fn vor Persist, Diagnose in `plan._meta.duration_auto_extend`.
- **G6** — Info-Chip „Skript-Timing verwendet" + „Auto-Extend"-Chip in `BriefingPlanSummary`.

## Was noch offen ist

### G4 — Voice-Pool an Szenen-Cast binden
`src/hooks/useApplyProductionPlan.ts`: Auto-Voice nur für Characters, die tatsächlich in `scene.resolved_cast` einer Szene sprechen. Aktuell werden Voices teils an Nicht-Speaker vergeben (Screenshot: „Sarah AI" in Szene ohne Sarah).

### G5 — Repair-Count Sanitize
Neuer Helper `src/features/briefing/utils/repairsCounter.ts`. Zählt nur echte Value-Changes (kein Rauschen wie „durationSec: 5 → 5"). Wird in `BriefingPlanSummary` statt Roh-Count verwendet → keine irreführenden „12 repariert" mehr.

### G7 — Skript-zu-lang-Warnung im Preisfeld
Im Clip-Generate-Panel (dort wo Preis steht):
- Wenn `sum(scene.durationSec) > project.totalDurationSec` **und** Grund = Auto-Extend → gelbe Meldung:
  > „Dein Skript ist länger als die geplante Videodauer. Video wird auf {computedSec}s verlängert (+{delta}s)."
- Preis auf neue Dauer berechnen.
Datei: das Panel wo Credits/Preis vor „Clip generieren" angezeigt wird (muss zuerst lokalisiert werden — vermutlich in `src/components/video-composer/GenerationPanel.tsx` o. ä.).

### G8 — AI-Fill % neu berechnen
`BriefingPlanSummary.tsx`: Prozentwert nur über wirklich fehlende Briefing-Felder rechnen (nicht über alle vom Parser gesetzten). Ziel: bei vollem Briefing < 10 %, aktuell zeigt es ~33 %.

## Nicht enthalten
- Debug-Chips (T-1) und Plan-Versioning (P-1) — separate Themen.
- Sub-Shot-Splitting — bewusst verworfen, Top-Level-SZENE gewinnt.

## Reihenfolge
G4 → G5 → G8 (im gleichen `BriefingPlanSummary`-Turn) → G7 (nach Lokalisierung des Preisfelds).

Nach Approval implementiere ich G4/G5/G7/G8 in einem Zug und teste gegen den 15s-Testfall (3 Szenen, 4 Sprecher).