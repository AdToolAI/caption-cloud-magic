

## Fix: Übergänge zu kurz + Ruckler nach Szene 3

### Problem 1: Übergänge nur sehr kurz sichtbar

Die UI (`SceneAnalysisStep.tsx`) setzt die Standard-Dauer auf **0.5s** (Zeile 484/494/1120). Der Resolver hat `MIN_DURATION = 0.6s`, also werden alle Übergänge auf 0.6s hochgeklemmt — aber das ist immer noch extrem kurz für einen sichtbaren Crossfade.

**Fix**: Default-Dauer in `SceneAnalysisStep.tsx` von 0.5s auf **1.2s** erhöhen (passend zum `DEFAULT_DURATION` im Resolver). Slider-Min von 0.2 auf 0.5 erhöhen.

### Problem 2: Ruckler nach Szene 3

Wenn die Transition endet (`active → idle`), führt der Renderer zwei Dinge aus:
1. `incoming.pause()` — OK
2. Der Player erkennt die Szenengrenze und macht `base.currentTime = nextSourceStart` (Zeile 578-579) — das verursacht einen Seek-Ruckler

Das Problem: Der Boundary-Check (Zeile 573) nutzt `effectiveBoundary = originalBoundary + offsetSeconds`, aber **nicht** das Transitions-Fenster. Wenn eine Transition aktiv ist, wird der Boundary-Check per `if (!cachedActiveTrans)` übersprungen (Zeile 562). Sobald die Transition endet, feuert der Boundary-Check sofort — aber der Base-Video ist jetzt an einer Position, die eventuell einen unnötigen Seek triggert.

**Fix**: Nach dem Ende einer Transition (`phaseRef: active → idle`) den `lastIncomingSeekRef` resetten, aber **keinen** harten Seek auf das Base-Video machen. Stattdessen im Player den Boundary-Check für **2 Frames** nach Transitions-Ende unterdrücken, ähnlich wie `pendingSceneAdvanceRef`.

### Konkrete Änderungen

**1. `src/components/directors-cut/steps/SceneAnalysisStep.tsx`**
- Zeile 484: `duration: prev[sceneId]?.duration || 0.5` → `|| 1.2`
- Zeile 494: `duration: sceneTransitions[sceneId]?.duration || 0.5` → `|| 1.2`
- Zeile 1120: `value={[sceneTransitions[scene.id]?.duration || 0.5]}` → `|| 1.2`
- Zeile 1122: `min={0.2}` → `min={0.5}`
- Zeile 1128: `(sceneTransitions[scene.id]?.duration || 0.5)` → `|| 1.2`

**2. `src/components/directors-cut/preview/useTransitionRenderer.ts`**
- Beim Übergang `active → idle` (Zeile 188): einen `transitionJustEndedRef` setzen
- Diesen Ref nach außen exponieren oder über einen Callback den Player informieren

**3. `src/components/directors-cut/DirectorsCutPreviewPlayer.tsx`**
- Nach `!cachedActiveTrans` Check (Zeile 562): zusätzlich prüfen ob eine Transition gerade erst geendet hat (innerhalb der letzten 0.1s). Falls ja, den Boundary-Seek überspringen, um den Ruckler zu vermeiden.
- Einfachste Variante: `wasInTransitionRef` das für 5 Frames nach Transitions-Ende den Boundary-Seek suppresst.

### Ergebnis
- Übergänge standardmäßig 1.2s lang → deutlich sichtbar
- Kein Ruckler nach Szene 3, weil der doppelte Seek am Transitions-Ende unterdrückt wird

