## Bug-Fix Plan v232

### Bug 1 — Local-Fallback zeigt 5.1s / 3 Szenen statt 15s / 1 Szene

**Ursache:** Wenn `briefing-deep-parse` (Gemini) hakt oder timeout, greift sofort ein Local-Fallback mit `briefing.duration ?? 5` und heuristischer 3-Beat-Aufteilung. Der Nutzer sieht diese Schätz-Zahlen als "Wahrheit" und interpretiert sie als Bug.

**Fix (A – Fallback erst nach Timeout):**
1. `ProductionPlanSheet.tsx` / Trigger-Hook: Statt sofort `buildLocalFallbackPlan` anzuzeigen, Modal im **Loading-State** halten (Spinner + „Briefing wird analysiert …").
2. Hartes Timeout: 45s. Erst danach Fallback-Plan mit deutlichem gelben Banner „Lokale Schätzung – AI-Analyse fehlgeschlagen" anzeigen.
3. Wenn AI zwischenzeitlich fertig wird, Loader durch echten Plan ersetzen (kein Fallback-Flash).
4. Wenn Fallback greift, `detectCanonicalBriefingTiming` weiterhin bevorzugen (schadet nicht), aber es ist explizit als „Schätzung" markiert.

### Bug 2 — Single-Speaker Lip-Sync wird still gekillt

**Ursache:** In `SceneDialogStudio.tsx` L1261-1270 verlangt `buttonIntendsLipSync` für 1 Sprecher `renderAsSeparateScenes=true` (der Multi-Speaker-Toggle). Ergebnis: Klick auf „Clip mit Lip-Sync generieren" bei 1 Sprecher → `forceCinematicSync=false` → fällt in `handleGenerateInline()` → dieser Pfad bricht ab, weil Voiceover-Path nicht sauber für 1-Speaker-Lip-Sync konfiguriert ist. Erst nachdem der Multi-Speaker-Toggle sichtbar/aktiv wird (bei State-Refresh), funktioniert es.

**Fix (A – Symmetrisch):**
1. `buttonIntendsLipSync` für 1 Sprecher entkoppeln von `renderAsSeparateScenes`. Neue Regel:
   ```
   buttonIntendsLipSync =
     (blocks.length === 1 && allHavePortraits) ||
     (blocks.length >= 2 && allHavePortraits && !renderAsSeparateScenes)
   ```
   Damit reicht bei 1 Sprecher ein Portrait + Klick, um sofort in Cinematic-Sync zu routen.
2. `forceCinematicSync` bleibt logisch, greift jetzt aber zuverlässig.
3. `renderAsSeparateScenes`-Toggle bleibt für Multi-Speaker sichtbar; für 1 Sprecher wird er gar nicht mehr benötigt und ausgeblendet (keine verwirrende UI-Umschaltung mehr).
4. Falls `allHavePortraits=false` bei 1 Sprecher → klarer Toast statt Silent-Kill: „Kein Portrait für {Name} — Lip-Sync nicht möglich, bitte Cast-Portrait hinterlegen."

### Version-Bump

- `CLIENT_PIPELINE_VERSION` → **232**

### Betroffene Dateien

- `src/hooks/useBriefingDeepParse.ts` (oder Trigger im `BriefingTab.tsx` / `ProductionPlanSheet.tsx`) – Loading-Gate + 45s-Timeout
- `src/components/video-composer/briefing/ProductionPlanSheet.tsx` – Loader-UI + Fallback-Banner
- `src/components/video-composer/SceneDialogStudio.tsx` – `buttonIntendsLipSync` erweitern, 1-Sprecher-Toggle ausblenden, Portrait-Missing-Toast
- `src/config/pipelineVersion.ts` – 231 → 232

### Nicht angefasst

- Server-seitige Sync.so / compose-video-clips-Logik (v231 Motion Gate bleibt aktiv).
- Multi-Speaker-Routing.
- Voice-Auto-Binding (bleibt bewusst leer, v225).