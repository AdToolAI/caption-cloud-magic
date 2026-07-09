# Fix-Bundle G (revidiert) — Szenen-Struktur folgt Top-Level SZENE-Markern

## Neuer Leitsatz
- **Szenenanzahl = Anzahl der Top-Level `SZENE N`-Marker** im Skript (nicht Sub-Shots wie 1A/1B).
- Beispiel-Briefing: 3 Szenen à 5s = 15s → Parser erzeugt **genau 3 Szenen**.
- Innerhalb einer Szene: mehrere Sprecher = Ensemble-Cast, dialogTurns halten die Reihenfolge.
- **Szenendauer flexibel**: Wenn die zugewiesene Sprech-/VO-Länge > Skript-Sollzeit ist, wird die Szene automatisch auf `max(sollzeit, sprechdauer + 1s)` hochgesetzt.

## Backend

### G1 (revidiert) — `detectScriptTimingMode`
Umstellen auf Top-Level-SZENE-Erkennung:
- Regex matcht nur `^SZENE N` / `^SCENE N` / `^SHOT N` (ohne Buchstaben-Suffix)
- Sub-Shots (1A/1B/2A) werden als `dialogTurns` innerhalb der Elternszene verarbeitet, nicht als eigene Szene
- Fallback bleibt: Speaker-Blöcke → Tier 2, Freetext → Tier 3

### G2 (revidiert) — Scene-Count-Guard
- Bei `SHOT_MARKERS`: exakt `topLevelScenes.length` Szenen, cast = Union aller Sprecher in den Sub-Turns dieser Szene
- Kein Solo-Trim mehr für Szenen mit mehreren Sub-Shot-Speakern → `enforceSoloCast` läuft nur wenn wirklich nur ein Speaker in der ganzen Szene spricht

### G3 — Duration Auto-Extend (neu)
Nach Voice/VO-Assignment, vor Persist:
- Für jede Szene: `estimatedSpeechSec` aus `dialogTurns` (Zeichenzahl / ~15 chars-per-sec, deutsch)
- Wenn `estimatedSpeechSec + 1 > scene.durationSec` → `scene.durationSec = ceil(estimatedSpeechSec + 1)`
- Diagnose in `parser_meta.duration_adjustments[]` (scene id, old, new, reason)

### G4 — Voice-Pool pro Szene binden
`useApplyProductionPlan.ts`: Auto-Voice nur für Characters in `resolved_cast` dieser Szene.

### G5 — Repair-Count Sanitize
Neuer Helper `repairsCounter.ts`, nur echte Value-Changes zählen.

## Client

### G6 — Info-Chip statt Warnung
`ProductionPlanSheet.tsx`: Bei `SHOT_MARKERS` und Board-Dauer ≠ Skript-Dauer → dezenter Chip „Skript-Timing verwendet".

### G7 — Skript-zu-lang-Warnung im Preisfeld (neu)
Im Clip-Generate-Panel (dort wo der Preis steht):
- Wenn Summe aller `scene.durationSec` > `project.totalDurationSec` **und** Grund = Speech-Overflow → gelbe Meldung:
  > „Dein Skript ist länger als die geplante Videodauer. Video wird auf {computedSec}s verlängert (+{delta}s)."
- Preis wird auf die neue Dauer berechnet.

### G8 — AI-Fill % neu berechnen
`BriefingPlanSummary.tsx`: nur wirklich fehlende Felder zählen.

## Verifikation gegen 15s-Testfall
- 3 Szenen à 5s (statt 2 à 10s oder 6 à 2s)
- Cast pro Szene = Union der dort sprechenden Charaktere
- Wenn Sprecher-Zeit in Szene 2 z.B. 7s → Szene wird auf 8s gehoben, Meldung im Preisfeld erscheint
- Info-Chip „Skript-Timing verwendet", Repair-Count realistisch, AI-Fill niedrig

## Nicht enthalten
- Sub-Shot-Splitting (verworfen — Skript-Top-Struktur gewinnt)
- Plan-Versioning, Debug-Chips (separat)

Nach Approval implementiere ich G1–G8 in einem Zug.
