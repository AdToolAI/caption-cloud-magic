# v430.1 — Paritätsbericht der Lip-Sync-Intent-Gates

Stand: 14.08.2026, nach **Schritt 2A + 2B + Gate 9**. Die sieben Anzeige-/Polling-Gates
(7, 10, 11, 12, 13, 15, 17), die beiden run-/kostenrelevanten Gates 8 und 18 sowie
das Intent-Fragment von Gate 9 laufen jetzt auf der SSoT `isLipSyncIntentional()`.
Die verbleibenden neun Gates (1–6, 14, 16, 19) bleiben mit ihrer heutigen
Abweichungsmenge bewusst eingefroren. Damit ist v430.1 funktional abgeschlossen.

## Grundlagen

SSoT (`src/lib/video-composer/lipSyncIntent.ts`):

```text
lipSyncWithVoiceover === false  -> false   (v245 Toggle-Veto, hart)
lipSyncWithVoiceover === true   -> true
dialogMode === true             -> true
engineOverride in {cinematic-sync, sync-segments, native-dialogue} -> true
sonst                           -> false
```

Fixture-Matrix: `src/lib/video-composer/__tests__/fixtures/lipSyncIntentMatrix.ts`,
volles Kreuzprodukt aus `lipSyncWithVoiceover x dialogMode x engineOverride`
= **45 Zeilen**, davon ist die SSoT auf **26** true.

ID-Schema: `L<t|f|u>-D<t|f|u>-E<auto|cs|ss|nd|u>`
(`L` = lipSyncWithVoiceover, `D` = dialogMode, `E` = engineOverride;
`t/f/u` = true/false/unset, `cs/ss/nd` = cinematic-sync/sync-segments/native-dialogue).

Tests:
- `src/lib/video-composer/__tests__/lipSyncIntentGateParity.test.ts` — 10 Gates auf `exact`, 9 Gates weiterhin auf ihrer eingefrorenen Differenz.
- `src/lib/composer/__tests__/lipSyncIntentGateScanner.test.ts` — AST-Scanner über alle lesenden Intent-Verwendungen in Bedingungskontexten (Allowlist nach 2A/2B/Gate 9 nachgezogen).
- `src/lib/composer/__tests__/forceCinematicSyncRouting.test.ts` — Routing-No-Op-Nachweis für Gate 9.

## Gesamtbild

- **19 klassifizierte Gates**, davon **10 `exact`**, **0 `broader`**, **0 `narrower`**, **9 `mixed`**.
- Umgestellt (2A): `scenecard-lipsync-actions`, `clipprogress-is-cinematic`, `clipprogress-should-be-lipsync`, `inlineplayer-needs-lipsync`, `inlineplayer-legacy-happyhorse-warn`, `clipstab-poll-cinematic`, `pipelineprogress-cinematic-generating`.
- Umgestellt (2B): `dialogstudio-wants-lipsync` (Studio-Start, kostenrelevant) und `generateall-needs-lipsync` (Ready-Zählung, ohne Dispatch-/Kostenpfad).
- Umgestellt (Gate 9): `dialogstudio-force-cinematic` — nur das Intent-Fragment; die Routing-Matrix bleibt durch `buttonIntendsLipSync` unverändert.
- Damit respektieren diese zehn Gates das Toggle-Veto und erkennen `sync-segments`, `native-dialogue` sowie den Voiceover-Opt-in.
- Bewusst unverändert eingefroren: Gates 1–6, 14, 16, 19 mit den zwei bekannten Fehlerklassen (Toggle-Veto ignoriert / Opt-in-Wege übersehen).
- Verbleibender direkter Read in `SceneDialogStudio.tsx` (~Zeile 2327): `engineOverride` als **Provider-Kennung für das Footer-Label** — kein Intent-Gate, bleibt bewusst ausserhalb der SSoT.

## Gate-für-Gate

### `scenecard-engine-migration`

- **Stelle:** `src/components/video-composer/SceneCard.tsx:510`
- **Zweck:** Auto-Migration der clipSource auf den zertifizierten Lip-Sync-Provider
- **Heutige Bedingung:** `isLipsyncEngine(scene.engineOverride ?? null)`
- **parity:** `mixed`
- **False positives (6)** — Gate true, SSoT false: `Lf-Dt-Ecs`, `Lf-Dt-Ess`, `Lf-Df-Ecs`, `Lf-Df-Ess`, `Lf-Du-Ecs`, `Lf-Du-Ess`
- **False negatives (14)** — SSoT true, Gate false: `Lt-Dt-Eauto`, `Lt-Dt-End`, `Lt-Dt-Eu`, `Lt-Df-Eauto`, `Lt-Df-End`, `Lt-Df-Eu`, `Lt-Du-Eauto`, `Lt-Du-End`, `Lt-Du-Eu`, `Lu-Dt-Eauto`, `Lu-Dt-End`, `Lu-Dt-Eu`, `Lu-Df-End`, `Lu-Du-End`

### `scenecard-native-dialogue-verbatim`

- **Stelle:** `src/components/video-composer/SceneCard.tsx:833`
- **Zweck:** Prompt-Modus "verbatim" statt "intent"
- **Heutige Bedingung:** `scene.engineOverride === 'native-dialogue'`
- **parity:** `mixed`
- **False positives (3)** — Gate true, SSoT false: `Lf-Dt-End`, `Lf-Df-End`, `Lf-Du-End`
- **False negatives (20)** — SSoT true, Gate false: `Lt-Dt-Eauto`, `Lt-Dt-Ecs`, `Lt-Dt-Ess`, `Lt-Dt-Eu`, `Lt-Df-Eauto`, `Lt-Df-Ecs`, `Lt-Df-Ess`, `Lt-Df-Eu`, `Lt-Du-Eauto`, `Lt-Du-Ecs`, `Lt-Du-Ess`, `Lt-Du-Eu`, `Lu-Dt-Eauto`, `Lu-Dt-Ecs`, `Lu-Dt-Ess`, `Lu-Dt-Eu`, `Lu-Df-Ecs`, `Lu-Df-Ess`, `Lu-Du-Ecs`, `Lu-Du-Ess`

### `scenecard-dialog-preflight`

- **Stelle:** `src/components/video-composer/SceneCard.tsx:1353`
- **Zweck:** Dialog-Preflight (Längenprüfung) vor dem Generieren
- **Heutige Bedingung:** `isLipsyncEngine(scene.engineOverride ?? null)`
- **parity:** `mixed`
- **False positives (6)** — Gate true, SSoT false: `Lf-Dt-Ecs`, `Lf-Dt-Ess`, `Lf-Df-Ecs`, `Lf-Df-Ess`, `Lf-Du-Ecs`, `Lf-Du-Ess`
- **False negatives (14)** — SSoT true, Gate false: `Lt-Dt-Eauto`, `Lt-Dt-End`, `Lt-Dt-Eu`, `Lt-Df-Eauto`, `Lt-Df-End`, `Lt-Df-Eu`, `Lt-Du-Eauto`, `Lt-Du-End`, `Lt-Du-Eu`, `Lu-Dt-Eauto`, `Lu-Dt-End`, `Lu-Dt-Eu`, `Lu-Df-End`, `Lu-Du-End`

### `scenecard-dialog-model-picker`

- **Stelle:** `src/components/video-composer/SceneCard.tsx:1703`
- **Zweck:** Modell-Picker zeigt nur die Dialog-Modelle
- **Heutige Bedingung:** `scene.dialogMode === true`
- **parity:** `mixed`
- **False positives (5)** — Gate true, SSoT false: `Lf-Dt-Eauto`, `Lf-Dt-Ecs`, `Lf-Dt-Ess`, `Lf-Dt-End`, `Lf-Dt-Eu`
- **False negatives (16)** — SSoT true, Gate false: `Lt-Df-Eauto`, `Lt-Df-Ecs`, `Lt-Df-Ess`, `Lt-Df-End`, `Lt-Df-Eu`, `Lt-Du-Eauto`, `Lt-Du-Ecs`, `Lt-Du-Ess`, `Lt-Du-End`, `Lt-Du-Eu`, `Lu-Df-Ecs`, `Lu-Df-Ess`, `Lu-Df-End`, `Lu-Du-Ecs`, `Lu-Du-Ess`, `Lu-Du-End`

### `scenecard-dialog-studio-entry`

- **Stelle:** `src/components/video-composer/SceneCard.tsx:2273`
- **Zweck:** Einstiegs-Button in das Scene Dialog Studio
- **Heutige Bedingung:** `scene.dialogMode !== true → null`
- **parity:** `mixed`
- **False positives (5)** — Gate true, SSoT false: `Lf-Dt-Eauto`, `Lf-Dt-Ecs`, `Lf-Dt-Ess`, `Lf-Dt-End`, `Lf-Dt-Eu`
- **False negatives (16)** — SSoT true, Gate false: `Lt-Df-Eauto`, `Lt-Df-Ecs`, `Lt-Df-Ess`, `Lt-Df-End`, `Lt-Df-Eu`, `Lt-Du-Eauto`, `Lt-Du-Ecs`, `Lt-Du-Ess`, `Lt-Du-End`, `Lt-Du-Eu`, `Lu-Df-Ecs`, `Lu-Df-Ess`, `Lu-Df-End`, `Lu-Du-Ecs`, `Lu-Du-Ess`, `Lu-Du-End`

### `scenecard-dialog-studio-mount`

- **Stelle:** `src/components/video-composer/SceneCard.tsx:2355`
- **Zweck:** Mount des Scene Dialog Studio (Intent-Anteil)
- **Heutige Bedingung:** `scene.dialogMode === true`
- **parity:** `mixed`
- **False positives (5)** — Gate true, SSoT false: `Lf-Dt-Eauto`, `Lf-Dt-Ecs`, `Lf-Dt-Ess`, `Lf-Dt-End`, `Lf-Dt-Eu`
- **False negatives (16)** — SSoT true, Gate false: `Lt-Df-Eauto`, `Lt-Df-Ecs`, `Lt-Df-Ess`, `Lt-Df-End`, `Lt-Df-Eu`, `Lt-Du-Eauto`, `Lt-Du-Ecs`, `Lt-Du-Ess`, `Lt-Du-End`, `Lt-Du-Eu`, `Lu-Df-Ecs`, `Lu-Df-Ess`, `Lu-Df-End`, `Lu-Du-Ecs`, `Lu-Du-Ess`, `Lu-Du-End`

### `scenecard-lipsync-actions` — v430.1: auf SSoT umgestellt

- **Stelle:** `src/components/video-composer/SceneCard.tsx:2386`
- **Zweck:** Leiste "Lip-Sync Aktionen" (Intent-Anteil der OR-Kette)
- **Heutige Bedingung:** `isLipSyncIntentional(scene)  // v430.1 Schritt 2A`
- **parity:** `exact`
- **False positives (0)**
- **False negatives (0)**

### `dialogstudio-wants-lipsync` — v430.1: auf SSoT umgestellt

- **Stelle:** `src/components/video-composer/SceneDialogStudio.tsx:1335`
- **Zweck:** Studio-Start erlaubt (sonst Toast "Lip-Sync ist ausgeschaltet")
- **Heutige Bedingung:** `isLipSyncIntentional(scene)  // v430.1 Schritt 2B`
- **parity:** `exact`
- **False positives (0)**
- **False negatives (0)**

### `dialogstudio-force-cinematic` — v430.1 Gate 9: Intent-Fragment auf SSoT umgestellt

- **Stelle:** `src/components/video-composer/SceneDialogStudio.tsx:1468`
- **Zweck:** Einzelblock-Dialog erzwingt die Cinematic-Sync-Kette (Intent-Anteil)
- **Heutige Bedingung:** `isLipSyncIntentional(scene)  // v430.1 Gate 9`
- **parity:** `exact`
- **False positives (0)**
- **False negatives (0)**
- **Routing-Hinweis:** Das vollständige Gate im Code lautet
  `blocks.length === 1 && allHavePortraits && (isLipSyncIntentional(scene) || buttonIntendsLipSync)`
  und bleibt bewusst **breiter** als die SSoT: `buttonIntendsLipSync` ist für jeden
  Single-Speaker-Fall mit Portrait true und dominiert den OR-Ausdruck (v232-Vertrag,
  Single-Speaker-Symmetrie). Auch die Toggle-Veto-Fälle (`Lf-*-Ecs`) routen daher
  weiterhin in die Cinematic-Sync-Kette — die Umstellung ist ein Routing-No-Op.
  Nachweis über das volle Kreuzprodukt (45 Fixtures × Blockzahl × Portrait × SRS):
  `src/lib/composer/__tests__/forceCinematicSyncRouting.test.ts`.

### `clipprogress-is-cinematic` — v430.1: auf SSoT umgestellt

- **Stelle:** `src/components/video-composer/SceneClipProgress.tsx:126`
- **Zweck:** Cinematic-Marker für die Fortschrittsanzeige
- **Heutige Bedingung:** `isLipSyncIntentional(scene)  // v430.1 Schritt 2A`
- **parity:** `exact`
- **False positives (0)**
- **False negatives (0)**

### `clipprogress-should-be-lipsync` — v430.1: auf SSoT umgestellt

- **Stelle:** `src/components/video-composer/SceneClipProgress.tsx:132`
- **Zweck:** Szene gilt als Lip-Sync-Szene (Spinner/Warnungen)
- **Heutige Bedingung:** `isLipSyncIntentional(scene)  // v430.1 Schritt 2A`
- **parity:** `exact`
- **False positives (0)**
- **False negatives (0)**

### `inlineplayer-needs-lipsync` — v430.1: auf SSoT umgestellt

- **Stelle:** `src/components/video-composer/SceneInlinePlayer.tsx:76`
- **Zweck:** Grüner Haken erst nach Lip-Sync (Intent-Anteil)
- **Heutige Bedingung:** `isLipSyncIntentional(scene)  // v430.1 Schritt 2A`
- **parity:** `exact`
- **False positives (0)**
- **False negatives (0)**

### `inlineplayer-legacy-happyhorse-warn` — v430.1: auf SSoT umgestellt

- **Stelle:** `src/components/video-composer/SceneInlinePlayer.tsx:223`
- **Zweck:** Warnung "Lip-Sync auf veraltetem Video" (Intent-Anteil)
- **Heutige Bedingung:** `isLipSyncIntentional(scene)  // v430.1 Schritt 2A`
- **parity:** `exact`
- **False positives (0)**
- **False negatives (0)**

### `clipstab-locks-user-duration`

- **Stelle:** `src/components/video-composer/ClipsTab.tsx:445`
- **Zweck:** Nutzer-Dauer wird gegen die gemessene Clip-Dauer verteidigt
- **Heutige Bedingung:** `engineOverride === 'cinematic-sync' || engineOverride === 'sync-segments'`
- **parity:** `mixed`
- **False positives (6)** — Gate true, SSoT false: `Lf-Dt-Ecs`, `Lf-Dt-Ess`, `Lf-Df-Ecs`, `Lf-Df-Ess`, `Lf-Du-Ecs`, `Lf-Du-Ess`
- **False negatives (14)** — SSoT true, Gate false: `Lt-Dt-Eauto`, `Lt-Dt-End`, `Lt-Dt-Eu`, `Lt-Df-Eauto`, `Lt-Df-End`, `Lt-Df-Eu`, `Lt-Du-Eauto`, `Lt-Du-End`, `Lt-Du-Eu`, `Lu-Dt-Eauto`, `Lu-Dt-End`, `Lu-Dt-Eu`, `Lu-Df-End`, `Lu-Du-End`

### `clipstab-poll-cinematic` — v430.1: auf SSoT umgestellt

- **Stelle:** `src/components/video-composer/ClipsTab.tsx:550`
- **Zweck:** 3s-Polling läuft weiter, solange Lip-Sync arbeitet (Intent-Anteil)
- **Heutige Bedingung:** `isLipSyncIntentional(s)  // v430.1 Schritt 2A`
- **parity:** `exact`
- **False positives (0)**
- **False negatives (0)**

### `preflight-dialog-checks`

- **Stelle:** `src/components/video-composer/RenderPreFlightDialog.tsx:148`
- **Zweck:** Dialog-spezifische Preflight-Blocker (Cast/Skript)
- **Heutige Bedingung:** `s.dialogMode (truthy)`
- **parity:** `mixed`
- **False positives (5)** — Gate true, SSoT false: `Lf-Dt-Eauto`, `Lf-Dt-Ecs`, `Lf-Dt-Ess`, `Lf-Dt-End`, `Lf-Dt-Eu`
- **False negatives (16)** — SSoT true, Gate false: `Lt-Df-Eauto`, `Lt-Df-Ecs`, `Lt-Df-Ess`, `Lt-Df-End`, `Lt-Df-Eu`, `Lt-Du-Eauto`, `Lt-Du-Ecs`, `Lt-Du-Ess`, `Lt-Du-End`, `Lt-Du-Eu`, `Lu-Df-Ecs`, `Lu-Df-Ess`, `Lu-Df-End`, `Lu-Du-Ecs`, `Lu-Du-Ess`, `Lu-Du-End`

### `pipelineprogress-cinematic-generating` — v430.1: auf SSoT umgestellt

- **Stelle:** `src/hooks/usePipelineProgress.ts:922`
- **Zweck:** Szene zählt als "in Arbeit" während Lip-Sync (Intent-Anteil)
- **Heutige Bedingung:** `isLipSyncIntentional(s)  // v430.1 Schritt 2A`
- **parity:** `exact`
- **False positives (0)**
- **False negatives (0)**

### `generateall-needs-lipsync` — v430.1: auf SSoT umgestellt

- **Stelle:** `src/hooks/useGenerateAllClips.ts:62`
- **Zweck:** Szene gilt erst nach Lip-Sync als pipeline-ready (Intent-Anteil)
- **Heutige Bedingung:** `isLipSyncIntentional(scene)  // v430.1 Schritt 2B`
- **parity:** `exact`
- **False positives (0)**
- **False negatives (0)**

### `mouthprobe-cinematic`

- **Stelle:** `src/hooks/useMouthYavgProbe.ts:41`
- **Zweck:** Mouth-Y-Probe läuft überhaupt
- **Heutige Bedingung:** `scene.engineOverride === 'cinematic-sync'`
- **parity:** `mixed`
- **False positives (3)** — Gate true, SSoT false: `Lf-Dt-Ecs`, `Lf-Df-Ecs`, `Lf-Du-Ecs`
- **False negatives (20)** — SSoT true, Gate false: `Lt-Dt-Eauto`, `Lt-Dt-Ess`, `Lt-Dt-End`, `Lt-Dt-Eu`, `Lt-Df-Eauto`, `Lt-Df-Ess`, `Lt-Df-End`, `Lt-Df-Eu`, `Lt-Du-Eauto`, `Lt-Du-Ess`, `Lt-Du-End`, `Lt-Du-Eu`, `Lu-Dt-Eauto`, `Lu-Dt-Ess`, `Lu-Dt-End`, `Lu-Dt-Eu`, `Lu-Df-Ess`, `Lu-Df-End`, `Lu-Du-Ess`, `Lu-Du-End`

