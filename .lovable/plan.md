## Plan v233 — Slider ist Single Source of Truth für Videodauer

### Entscheidung
Der **Videodauer-Slider** im Briefing-Tab gewinnt IMMER gegen jede aus dem Briefing-Text erkannte Zeitangabe. Kein Fallback-Guessing mehr, kein „15s im Text, 5s im Slider" Konflikt.

### Verhalten
- Slider steht z. B. auf `5s` → Plan hat exakt 5 s Gesamtdauer, egal was im Freitext steht.
- Slider steht auf `15s` → Plan hat exakt 15 s, auch wenn der Text nichts dazu sagt oder etwas anderes sagt.
- Gilt gleichermaßen für:
  - AI-Plan von `briefing-deep-parse`
  - Local-Fallback-Plan (`buildLocalFallbackPlan`)
  - Late-Arrival-Retry
  - `detectCanonicalBriefingTiming` / SZENE-Block-Extraktion

### Umsetzung (technisch)

1. **`briefing-deep-parse` (Edge Function)**
   - `targetDurationSec` aus dem Client-Payload (Slider-Wert) wird zur harten Vorgabe.
   - Nach Pass A + Pass B: **Enforce-Duration-Pass**, der Szenen-Durations proportional auf `targetDurationSec` skaliert (Summe = Slider ±0.5s Toleranz).
   - Prompt-Hinweis: „Total duration MUST equal {targetDurationSec}s. Ignore any conflicting duration mentioned in the briefing text."

2. **`buildLocalFallbackPlan`**
   - Nutzt `briefing.duration` (Slider) direkt, nicht `?? 5`.
   - Verteilt gleichmäßig auf N Szenen (N aus Briefing/SZENE-Blöcken oder Default 3).

3. **`detectCanonicalBriefingTiming`**
   - Wenn Slider gesetzt (>0), Text-Timing wird nur zur Szenenverteilung genutzt, Summe wird auf Slider normalisiert.

4. **`ProductionPlanSheet` UI**
   - Kleiner Hinweis unter der Gesamtdauer: „Aus Slider übernommen ({X}s)".
   - Wenn Text-Angabe (z. B. „15 Sekunden") ≠ Slider, gelbes Info-Chip: „Text erwähnt {Y}s, Slider gewinnt".

5. **`useStoryboardTransition` / v232 Loader**
   - Passt: Slider-Wert wird bereits mitgeschickt, jetzt eben auch hart durchgesetzt.

### Version
- `CLIENT_PIPELINE_VERSION` → **233**

### Betroffene Dateien
- `supabase/functions/briefing-deep-parse/index.ts` — Enforce-Duration-Pass, Prompt-Update
- `src/lib/video-composer/briefing/buildLocalFallbackPlan.ts` — Slider first
- `src/lib/video-composer/briefing/detectCanonicalBriefingTiming.ts` — Normalisieren auf Slider
- `src/components/video-composer/briefing/ProductionPlanSheet.tsx` — Hinweis-Chip
- `src/config/pipelineVersion.ts` — 232 → 233

### Nicht angefasst
- Lip-Sync-Pipeline, Cast/Voice-Routing, v231 Motion Gate, v232 Loader/Single-Speaker-Fix.
