## Problem 1 — Lip-Sync wird als isolierter Avatar gerendert statt in die Szene eingebaut

Die betroffene Szene (S02 „Problem") steht in der DB auf:
`dialog_mode=true, lip_sync_with_voiceover=false, engine_override='auto', clip_source='ai-happyhorse'`.

In `supabase/functions/compose-video-clips/index.ts` (Zeilen 1517–1547) gibt es einen Auto-Route-Branch:
> Wenn `engine_override='auto'` UND die Szene Dialog-Text + ein Cast-Charakter-Shot + ≤1 Sprecher hat → HeyGen-Talking-Head.

HeyGen erzeugt einen Brust-Bild-Avatar (Porträt + Sprache), **nicht** den eigentlichen Szenenclip mit aufmoduliertem Lip-Sync. Der Nutzer erwartet aber Cinematic-Sync (Hailuo-Plate der Szene + Sync.so-Lip-Sync), denn er hat den „Dialog & Lip-Sync"-Toggle aktiviert.

Der Toggle in `SceneCard.tsx` (Zeilen 1197–1258) setzt aktuell nur `dialog_mode` (+ ggf. `clip_source`/`clip_quality`). Er erzwingt **nicht** `engine_override='cinematic-sync'` und nicht `lip_sync_with_voiceover=true`. Genau deshalb landet die Szene im HeyGen-Branch statt im Cinematic-Sync-Pfad.

### Fix
- Toggle „Dialog & Lip-Sync" in `SceneCard.tsx`:
  - **ON** → optimistisch + atomic DB-Write von `dialog_mode=true`, `engine_override='cinematic-sync'`, `lip_sync_with_voiceover=true` (zusätzlich zur bestehenden clip_source/quality-Korrektur).
  - **OFF** → `dialog_mode=false`, `engine_override='auto'`, `lip_sync_with_voiceover=false`.
- Pending-Registry in `src/lib/video-composer/lipSyncPending.ts` um `engineOverride` erweitern (analog zu `dialogModePending` / `lipSyncPending`), damit Realtime-Refetch und debounced Save den Toggle nicht zurückdrehen.
- Hydration + debounced `persistScenesToDb` in `VideoComposerDashboard.tsx` müssen `resolveEngineOverrideValue` / `getEngineOverridePending` ebenfalls respektieren.

So routet `compose-video-clips` die Szene zuverlässig in den Cinematic-Sync-Branch (Hailuo-Plate → Sync.so) und der Lip-Sync wird in die eigentliche Szene eingebaut.

## Problem 2 — Progressbar startet bei ~48 % und ETA wirkt sinnlos

`usePipelineProgress.ts` ermittelt den Gesamt-Prozentwert gewichtet über alle Phasen (clips 55 %, voiceover 10 %, lipsync 20 %, music 5 %, export 10 %). Wenn der Nutzer mitten in der Session **nur** Lip-Sync neu anstößt (oder die Auto-Trigger-Kette nach bereits gerenderten Clips startet), wird `lipsync:start` emittiert, aber `clips:start` nicht. Folge:

- `baselineRef` wird zwar im `lipsync:start`-Branch befüllt, aber die bereits fertigen Clips/Voiceover/Music tragen über `clipsReal.progress=1` (bzw. die `done`-Phasen) ihre vollen Gewichte (55 % + 10 % + 5 %) in `phaseOverall` ein → der Balken springt sofort auf ~70 % (im Screenshot 48 %, weil nicht alle Clips ready sind).
- `pipelineStartRef` wird im neuen Run nicht zurückgesetzt, dadurch zeigt die ETA-Zeile `23s / ~23s` (Elapsed = "Remaining"), wirkt also als hätte sie keine Schätzung.

### Fix
- In `usePipelineProgress.ts`:
  - Beim Empfang eines `*:start`-Events, das **nicht** `clips` ist, und solange `pipelineStartRef` null ist (= frischer Run): `pipelineStartRef`/`floorRef`/`startedAtRef` zurücksetzen wie beim `clips:start`-Branch.
  - In `phaseOverall`: nur Phasen aufsummieren, die im aktuellen Run **aktiv** sind (laufen oder seit dem aktuellen Run abgeschlossen). Phasen, die schon vor dem Run fertig waren (`baselineRef.voiceoverHadAudio`, `baselineRef.musicHad`, `clips` komplett unter Baseline), werden mit `applicable:false` markiert und aus der Gewichtung herausgefiltert. Die verbliebenen Gewichte werden auf 100 % normalisiert (`weight / sum(activeWeights)`).
  - `etaSeconds` wieder über `PHASE_NOMINAL_SECONDS` der noch laufenden Phasen berechnen, sodass die rechte Zeile als `elapsed / ~total` ein realistisches Total zeigt (z. B. `23s / ~2:00 min`).

## Technische Details

| Datei | Änderung |
|---|---|
| `src/components/video-composer/SceneCard.tsx` | Dialog-&-Lip-Sync-Toggle erweitert um `engine_override`/`lip_sync_with_voiceover` (ON/OFF), inkl. Rollback bei DB-Fehler. |
| `src/lib/video-composer/lipSyncPending.ts` | Drittes Registry-Paar für `engineOverride` (`mark/clear/get/resolveEngineOverridePending`). |
| `src/components/video-composer/VideoComposerDashboard.tsx` | Hydration + debounced Save nutzen neuen Resolver für `engineOverride`. |
| `src/hooks/usePipelineProgress.ts` | Run-Baseline-Reset bei lipsync-/voiceover-/export-only Start; nur aktive Phasen gewichten; ETA aus aktiven Phasen ableiten. |

Keine Änderungen an Edge-Functions, Sync.so-Pipeline, Render-Engine oder Audio-Mux.