# Fix-Bundle J — Briefing wird immer noch nicht 1:1 umgesetzt

## Ist-Zustand (aus deinen Screenshots)

| # | Briefing sagt | Screenshot zeigt | Status |
|---|---|---|---|
| J1 | **15 Sek** Gesamtdauer | **30 Sek** Gesamtdauer | ❌ |
| J2 | **6 Shots** (1A, 1B, 2A, 2B, 3A, 3B) à **2,5 Sek** | **3 Szenen à 10 Sek** | ❌ |
| J3 | Shot 1A: **nur Sprecher 1** (Samuel) | Cast enthält Samuel, Matthew, Sarah, Kailee → „share the scene together" | ❌ Ensemble-Leak |
| J4 | Sprecher 1 = **Stadtstraße**, Sprecher 2 = **Startup-Büro**, Sprecher 3 = **Café**, Sprecher 4 = **Creator-Studio** | Alle Szenen: „Location — nicht zugeordnet" | ❌ |
| J5 | 4 distinkte Sprecher (Samuel/Matthew/Sarah/Kailee) | Voice zeigt „George AI" / „Auto-Voice beim Anwenden" statt Charakter-gebundener Stimme | ❌ |
| J6 | Shot 3A = Split-Screen mit **allen 4**, Shot 3B = **Endcard ohne Sprecher** | Fehlt komplett | ❌ |
| J7 | Chip zeigt „Skript-Timing verwendet · **7 Shots**" | Sheet rendert aber nur **3 Szenen** | ❌ Detector ≠ Reducer |

**Root Cause:** `detectScriptTimingMode` erkennt die 6 Sub-Shots (deshalb 7-Shots-Chip inkl. Endcard), aber Pass A / Reducer mergt sie danach wieder auf die 3 Top-Level-Szenen — genau der Bug, den wir mit I1/I2 fixen wollten, aber noch nicht implementiert haben. Alle Downstream-Probleme (Ensemble-Cast, fehlende Locations, falsche Voices) sind Folgefehler dieses Merges.

## Plan

### J1 — Sub-Shots als kanonische Szenen erzwingen
`supabase/functions/briefing-deep-parse/detectScriptTimingMode.ts`:
- Wenn Sub-Shot-Marker (`1A`, `1B`, `2A`, `2B`, `3A`, `3B`) mit expliziten Zeitfenstern (`0–2,5 Sek`, `2,5–5 Sek`, …) erkannt werden → jeder Sub-Shot ist eine **eigene** Scene.
- Top-Level „Szene 1/2/3" wird zu einem `sceneGroup`-Label (rein informativ, nicht als Merge-Signal).
- `scriptTiming.scenes = 6`, `scriptTiming.totalSec = 15`, jeder Shot `durationSec = 2.5`.

### J2 — Reducer respektiert `scriptTiming.scenes` strikt
`supabase/functions/briefing-deep-parse/index.ts`:
- Nach Pass A: `assert(plan.scenes.length === scriptTiming.scenes)`. 
- Wenn Pass A weniger Scenes liefert → Repair splittet die längsten Scenes an Sub-Shot-Grenzen (Speaker-Turn-Boundaries), statt sie zu mergen.
- Wenn Pass A mehr Scenes liefert → drop Trailing-Extras.
- Board-`durationSec` wird **ignoriert** wenn `scriptTiming.totalSec` gesetzt ist (Script-Wins).

### J3 — Ensemble-Cast-Trim auf Reducer-Ebene (nicht nur Scrubber)
`enforceSoloCast.ts` läuft heute **nach** Pass A. Problem: Pass A schreibt bereits alle 4 Speaker in `scene.cast`, und der Scrubber entfernt nur die Prosa — das Cast-Array bleibt bloated.
- Fix: `enforceSoloCast` trimmt `cast` auf die Speaker-IDs, die tatsächlich in `dialogTurns` dieser Szene vorkommen. Wenn `dialogTurns.length === 1 && cast.length > 1` → drop alle anderen.
- Für Shot 3A (Split-Screen, kein Dialog) → Ausnahme via `sceneKind: 'ensemble_showcase'`.
- Für Shot 3B (Endcard, kein Speaker) → `cast: []`, `dialogTurns: []`.

### J4 — Location-Freetext pro Shot aus Briefing extrahieren
`supabase/functions/briefing-deep-parse/index.ts` Pass B:
- Pro Shot: erste "Location:"-Zeile aus dem zugehörigen Briefing-Block extrahieren.
- Wenn kein Library-Match → `location.description` mit dem Freetext füllen („Modern city street with traffic and pedestrians" etc.) statt `null` zu lassen.
- `ProductionPlanSheet.tsx` zeigt bereits `location.description` an, wenn `locationId` leer ist — das funktioniert bereits, es fehlt nur der Freetext-Input.

### J5 — Voice strikt an Character-ID binden
`useApplyProductionPlan.ts` (G4 war halb-fertig):
- Vor Apply: pro Charakter aus Library sein `voiceId` lesen. Wenn gesetzt → binden.
- Wenn nicht gesetzt → `voice = null` (nicht Auto-Voice-Fallback auf einen Namen wie „George AI"), damit der User im Studio explizit auswählt.
- „Auto-Voice beim Anwenden" chip zeigen wir nur wenn tatsächlich noch **keine** Voice gebunden ist.

### J6 — Showcase- & Endcard-Shots im Detector
`detectScriptTimingMode.ts`:
- Marker „Shot 3A" mit „Split-Screen" / „Showcase" → `sceneKind: 'ensemble_showcase'`, `cast = alle 4`.
- Marker „Shot 3B" / „Endcard" ohne Sprecher-Zeile → `sceneKind: 'endcard'`, `cast: []`, `dialogTurns: []`, `overlayText` aus Briefing.

### J7 — UI-Chip-Zahl an Reducer-Output koppeln
`BriefingPlanSummary.tsx`:
- Chip „Skript-Timing verwendet · N Shots" liest **nicht** mehr aus `scriptTiming.detectedShots`, sondern aus `plan.scenes.length` (Post-Reducer-Wahrheit). So kann nie wieder „7 Shots" stehen wenn nur 3 gerendert werden.

## Betroffene Dateien
- `supabase/functions/briefing-deep-parse/detectScriptTimingMode.ts` (J1, J6)
- `supabase/functions/briefing-deep-parse/index.ts` (J2, J4)
- `supabase/functions/briefing-deep-parse/enforceSoloCast.ts` (J3 – Cast-Trim ergänzen)
- `src/hooks/useApplyProductionPlan.ts` (J5)
- `src/components/video-composer/briefing/BriefingPlanSummary.tsx` (J7)

## Erwartetes Ergebnis für dieses Briefing
```
S01  Shot 1A  Samuel   Stadtstraße        2.5s  cinematic-sync
S02  Shot 1B  Matthew  Startup-Büro       2.5s  cinematic-sync
S03  Shot 2A  Sarah    Urbanes Café       2.5s  cinematic-sync
S04  Shot 2B  Kailee   Creator-Studio     2.5s  cinematic-sync
S05  Shot 3A  ensemble Split-Screen       2.5s  (kein Lip-Sync)
S06  Shot 3B  —        Endcard/Branding   2.5s  (kein Lip-Sync)
Gesamt: 15.0s · 6 Scenes · Chip: „6 Shots"
```

Sag „go" und ich baue J1–J7 in einem Rutsch.