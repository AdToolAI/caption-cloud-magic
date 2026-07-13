# Bug: Ladebalken zeigt Lip-Sync obwohl Toggle AUS

## Analyse — Root Cause

Der Clip wurde korrekt **ohne** Sync.so gerendert (Provider-nativ, Toggle war aus). Trotzdem zeigt `PipelineProgressBar` eine Lipsync-Phase mit Fortschritt/Warten. Grund:

`src/hooks/usePipelineProgress.ts` benutzt an **drei** Stellen eine **eigene** Heuristik, um zu entscheiden, ob eine Szene ein Lip-Sync-Target ist:

```ts
(s.twoshotStage
  || s.engineOverride === 'cinematic-sync'
  || dialogVoiceCount(s) > 1)   // ← ← ← der Übeltäter
```

Sobald ein Briefing ≥ 2 Sprecher hat (`dialogVoices`-Map), gilt die Szene für die Progress-UI als Lip-Sync-Target — **auch wenn der User `lipSyncWithVoiceover` bewusst ausgeschaltet hat**, `dialogMode=false` ist und der `engineOverride` z. B. auf `broll` steht.

Konsequenz:
- `hasLipsyncScenes = true` → Lipsync-Balken wird sichtbar
- `lipsyncTotal > 0` → Baseline erwartet Sync.so-Runs, die aber nie kommen
- Balken hängt in der Lipsync-Phase und suggeriert einen Prozess, der backend-seitig gar nicht startet

Wir haben bereits die **Single Source of Truth** dafür: `src/lib/video-composer/lipSyncIntent.ts → isLipSyncIntentional(scene)`. Sie wird in der Render-Dispatch-Logik konsistent verwendet, aber die Progress-Ableitung wurde bei ihrer Einführung nicht mit umgestellt (v-drift).

## Fix — 1 Datei, 3 Stellen

**Nur `src/hooks/usePipelineProgress.ts`.** Kein Backend, keine Render-Pipeline-Änderung.

1. Import ergänzen:
   ```ts
   import { isLipSyncIntentional } from '@/lib/video-composer/lipSyncIntent';
   ```
2. Alle drei Vorkommen der lokalen Heuristik durch `isLipSyncIntentional(s)` ersetzen:
   - `useEffect` `clips:start`-Baseline-Snapshot (~Zeile 226): `lipTargets`-Filter
   - Lazy-Baseline-`useEffect` (~Zeile 295): `lipTargets`-Filter
   - `hasLipsyncScenes` `useMemo` (~Zeile 340): Rückgabewert
   - `lipsyncReal` `useMemo` (~Zeile 447/465): das `dialogVoiceCount(s) > 1`-Bein
3. Zusätzliche Absicherung in `hasLipsyncScenes`: Wenn `twoshotStage` bereits `'canceled'`/nicht gesetzt ist **und** `isLipSyncIntentional(s) === false`, gilt die Szene nie als Target — auch nicht rückwirkend, wenn eine ältere DB-Zeile noch einen alten `twoshotStage`-Wert trägt.
4. `dialogVoiceCount` bleibt bestehen (wird an anderen Stellen für Shot-Berechnungen genutzt), verliert aber seine Rolle als Intent-Signal.

## Erwartetes Verhalten nach Fix

- Toggle AUS + Provider-nativer Clip fertig → `hasLipsyncScenes=false` → Lipsync-Phase erscheint **gar nicht** in der Bar, `PHASE_WEIGHTS.lipsync` wird auf die anderen Phasen umverteilt (bestehende Logik).
- Toggle AN oder `dialogMode` oder manuelle Sync-Engine → Verhalten unverändert.
- Bestehende, echte Sync.so-Runs (twoshotStage/dialogShots aktiv) werden weiterhin korrekt erkannt, weil `isLipSyncIntentional` das über `engineOverride ∈ {cinematic-sync, sync-segments, native-dialogue}` bzw. den Toggle abdeckt.

## Verifikation

- Vitest: bestehende `lipSyncIntent.test.ts` bleibt grün.
- Manuell: Szene mit 2 Sprechern im Briefing, Lip-Sync-Toggle aus, Render starten → Progress-Bar zeigt nur noch Clips + (ggf.) Voiceover/Musik/Export, keine Lipsync-Zeile.

## Was NICHT geändert wird

- Kein Eingriff in Render-Dispatch, `compose-dialog-segments`, Sync.so-Webhooks, Credit-Refund, `PipelineProgressBar.tsx`.
- Kein neuer State, keine Migration, kein UI-Redesign.
