## Ziel
Alle aktuell ignorierten Felder aus dem Production Plan sauber ins Storyboard durchreichen und über `driftDetector` verifizierbar machen. Lipsync-Pipeline bleibt unangetastet (kein Eingriff in `dialog_shots`, `syncso_*`, `dialogLockedAt`, `lockReferenceUrl`, Apply-Schutzfilter).

## Lücken die geschlossen werden

| # | Plan-Feld | Heute | Neu |
|---|-----------|-------|-----|
| 1 | `transition` (type+duration) | hart `crossfade`/0.4s | Plan-Wert übernehmen, Fallback bleibt crossfade |
| 2 | `textOverlay` (text/position/animation/fontSize/color) | leerer Default | Plan-Wert übernehmen |
| 3 | `tone` (scene-level) | nur `briefing.tone` | scene-tone gewinnt, briefing-tone als Fallback |
| 4 | `actionBeat` (character/environment/intensity) | Heuristik aus anchorEN | explizite Plan-Felder gewinnen, Heuristik nur Fallback |
| 5 | `seed` / `seedVariations` | ignoriert | direkt durchreichen |
| 6 | 2. Cast-Member `shotType` | hardcoded `profile` | pro Cast-Eintrag eigenes `shotType` im Plan + Mapping |

## Änderungen

### 1. Schema-Erweiterung (`src/lib/video-composer/briefing/productionPlan.ts`)
- `TPlanScene` bekommt optionale Felder:
  - `transition?: { type: 'crossfade'|'fade'|'cut'|'slide'|'wipe'|'zoom'|'blur'|'push'; durationSec?: number }`
  - `textOverlay?: { text: string; position?: 'top'|'middle'|'bottom'; animation?: string; fontSizePx?: number; color?: string }`
  - `tone?: string`
  - `seed?: number`
  - `seedVariations?: number[]`
- `TPlanCast` bekommt `shotType?: CharacterShotType` (full|profile|back|detail|pov|silhouette)
- Alle Felder optional → bestehende Pläne bleiben kompatibel.

### 2. Pass-A Prompt (`supabase/functions/briefing-deep-parse/index.ts`)
- JSON-Schema im System-Prompt um die neuen Felder erweitern, mit Beispielen.
- Explizit dokumentieren: `transition` zwischen Szene n und n+1, `textOverlay.text` darf leer bleiben.
- LANGUAGE LOCK bleibt unangetastet.

### 3. Apply-Mapping (`src/hooks/useApplyProductionPlan.ts → planSceneToComposerScene`)
- `transitionType` / `transitionDuration` aus `ps.transition` (Fallback crossfade/0.4).
- `textOverlay` aus `ps.textOverlay` (Fallback DEFAULT_TEXT_OVERLAY).
- `realismPreset = realismFromTone(ps.tone ?? briefingTone)`.
- `actionBeat`: wenn `ps.actionBeat` existiert → übernehmen; sonst aktuelle `splitAction` + `motionIntensityFromMusic` Heuristik.
- `seed` / `seedVariations` direkt setzen.
- `characterShots`-Builder: pro Cast-Eintrag `c.shotType ?? (i===0 ? primaryShot : 'profile')` — eliminiert Hardcode für 2. Sprecher.

### 4. Drift-Checks (`src/lib/video-composer/briefing/driftDetector.ts`)
Neue Checks (alle severity = `warning` außer 1+2 die `error` sind wenn Plan-Wert non-default):
- `transition_not_applied` — plan hatte type, composer hat anderen type
- `text_overlay_not_applied` — plan.textOverlay.text gesetzt, composer.textOverlay.text leer
- `tone_not_applied` — plan.tone gesetzt, composer.realismPreset undefined
- `action_beat_not_applied` — plan.actionBeat.characterAction gesetzt, composer.actionBeat.characterAction abweichend
- `seed_not_applied` — plan.seed gesetzt, composer.seed null
- `cast_shot_type_not_applied` — plan.cast[i].shotType abweichend von composer.characterShots[i].shotType

### 5. Verification Chips (`src/components/video-composer/briefing/ProductionPlanSheet.tsx`)
Pro Szene 6 neue Mini-Chips dazu:
`✓ Transition · ✓ Overlay · ✓ Tone · ✓ Beat · ✓ Seed · ✓ Cast-Shots`
Tooltip zeigt jeweiligen Wert. Gleiche Mechanik wie bestehende Skript/Shot-Director-Chips.

### 6. Local-Fallback-Plan (`src/hooks/useStoryboardTransition.ts → buildLocalFallbackPlan`)
Regex-Extraktion erweitern um:
- `TRANSITION:` / `ÜBERGANG:` → `transition.type`
- `OVERLAY:` / `TEXT:` → `textOverlay.text`
- `TONE:` / `TON:` → `tone`
- `SEED: <n>` → `seed`
- `SHOT (sprecher2):` → 2. Cast-shotType

## Außerhalb des Scopes (Lipsync-Safety)
- Keine Änderung an `compose-dialog-segments`, `sync-so-webhook`, `dialog_shots`, `composer_scenes.dialog_*`, `dialogLockedAt`, `lockReferenceUrl`.
- Keine Änderung am Apply-Schutzfilter (`isLocallyProtected` + DB-Probe).
- Keine Änderung an Voice-/Cast-Resolver in `briefing-deep-parse` Pass B.
- Keine Migration an `composer_scenes` — alle Felder existieren bereits (transition_type, transition_duration, text_overlay, seed, seed_variations).

## Verification
1. Test-Briefing mit allen 6 Feldern (Transition: slide, Overlay: "ENDE", Tone: dramatic, Seed: 42, 2 Sprecher unterschiedliche shotTypes).
2. Deep-parse → Plan-Sheet zeigt alle 6 neuen Chips grün mit korrekten Werten.
3. Apply → ProductionPlanSheet öffnet Drift-Panel: 0 Findings.
4. SceneCard inspizieren: transitionType=slide, textOverlay.text="ENDE", seed=42, cast[1].shotType wie spezifiziert.
5. Mit funktionierender Lipsync-Szene erneut: keine Regression auf dialog_shots / lock-Felder.
