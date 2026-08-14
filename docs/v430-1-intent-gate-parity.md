# v430.1 Schritt 1 — Paritätsbericht der Lip-Sync-Intent-Gates

Stand: 14.08.2026. **Keine Produktionsänderung.** Dieser Bericht friert die
heutige Sichtbarkeits-/Aktivierungssemantik ein und beziffert je Gate die
Differenz zur SSoT `isLipSyncIntentional()`. Über die Umstellung wird erst in
Schritt 2 entschieden — Gate für Gate.

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
- `src/lib/video-composer/__tests__/lipSyncIntentGateParity.test.ts` (27 Tests) — friert je Gate false-positive-Menge, false-negative-Kardinalität und `parity` ein.
- `src/lib/composer/__tests__/lipSyncIntentGateScanner.test.ts` (2 Tests) — AST-Scanner über alle lesenden Intent-Verwendungen in Bedingungskontexten.

## Gesamtbild

- **19 klassifizierte Gates**, davon **0 `exact`**, **1 `broader`**, **0 `narrower`**, **18 `mixed`**.
- Kein einziges Gate ist heute paritätisch zur SSoT.
- Zwei wiederkehrende Fehlerklassen:
  1. **Toggle-Veto ignoriert** (false positive): jedes `engineOverride === 'cinematic-sync'`-Gate feuert bei `lipSyncWithVoiceover=false + cinematic-sync` (`Lf-Dt-Ecs`, `Lf-Df-Ecs`, `Lf-Du-Ecs`), obwohl der Nutzer Lip-Sync explizit ausgeschaltet hat.
  2. **Opt-in-Wege übersehen** (false negative): dieselben Gates sehen weder `lipSyncWithVoiceover=true` ohne cinematic-sync noch `sync-segments`/`native-dialogue`.

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

### `scenecard-lipsync-actions`

- **Stelle:** `src/components/video-composer/SceneCard.tsx:2385`
- **Zweck:** Leiste "Lip-Sync Aktionen" (Intent-Anteil der OR-Kette)
- **Heutige Bedingung:** `scene.engineOverride === 'cinematic-sync'`
- **parity:** `mixed`
- **False positives (3)** — Gate true, SSoT false: `Lf-Dt-Ecs`, `Lf-Df-Ecs`, `Lf-Du-Ecs`
- **False negatives (20)** — SSoT true, Gate false: `Lt-Dt-Eauto`, `Lt-Dt-Ess`, `Lt-Dt-End`, `Lt-Dt-Eu`, `Lt-Df-Eauto`, `Lt-Df-Ess`, `Lt-Df-End`, `Lt-Df-Eu`, `Lt-Du-Eauto`, `Lt-Du-Ess`, `Lt-Du-End`, `Lt-Du-Eu`, `Lu-Dt-Eauto`, `Lu-Dt-Ess`, `Lu-Dt-End`, `Lu-Dt-Eu`, `Lu-Df-Ess`, `Lu-Df-End`, `Lu-Du-Ess`, `Lu-Du-End`

### `dialogstudio-wants-lipsync`

- **Stelle:** `src/components/video-composer/SceneDialogStudio.tsx:1335`
- **Zweck:** Studio-Start erlaubt (sonst Toast "Lip-Sync ist ausgeschaltet")
- **Heutige Bedingung:** `scene.lipSyncWithVoiceover === true || scene.dialogMode === true`
- **parity:** `mixed`
- **False positives (5)** — Gate true, SSoT false: `Lf-Dt-Eauto`, `Lf-Dt-Ecs`, `Lf-Dt-Ess`, `Lf-Dt-End`, `Lf-Dt-Eu`
- **False negatives (6)** — SSoT true, Gate false: `Lu-Df-Ecs`, `Lu-Df-Ess`, `Lu-Df-End`, `Lu-Du-Ecs`, `Lu-Du-Ess`, `Lu-Du-End`

### `dialogstudio-force-cinematic`

- **Stelle:** `src/components/video-composer/SceneDialogStudio.tsx:1465`
- **Zweck:** Einzelblock-Dialog erzwingt die Cinematic-Sync-Kette (Intent-Anteil)
- **Heutige Bedingung:** `scene.engineOverride === 'cinematic-sync' || scene.lipSyncWithVoiceover === true`
- **parity:** `mixed`
- **False positives (3)** — Gate true, SSoT false: `Lf-Dt-Ecs`, `Lf-Df-Ecs`, `Lf-Du-Ecs`
- **False negatives (8)** — SSoT true, Gate false: `Lu-Dt-Eauto`, `Lu-Dt-Ess`, `Lu-Dt-End`, `Lu-Dt-Eu`, `Lu-Df-Ess`, `Lu-Df-End`, `Lu-Du-Ess`, `Lu-Du-End`

### `clipprogress-is-cinematic`

- **Stelle:** `src/components/video-composer/SceneClipProgress.tsx:126`
- **Zweck:** Cinematic-Marker für die Fortschrittsanzeige
- **Heutige Bedingung:** `scene.engineOverride === 'cinematic-sync'`
- **parity:** `mixed`
- **False positives (3)** — Gate true, SSoT false: `Lf-Dt-Ecs`, `Lf-Df-Ecs`, `Lf-Du-Ecs`
- **False negatives (20)** — SSoT true, Gate false: `Lt-Dt-Eauto`, `Lt-Dt-Ess`, `Lt-Dt-End`, `Lt-Dt-Eu`, `Lt-Df-Eauto`, `Lt-Df-Ess`, `Lt-Df-End`, `Lt-Df-Eu`, `Lt-Du-Eauto`, `Lt-Du-Ess`, `Lt-Du-End`, `Lt-Du-Eu`, `Lu-Dt-Eauto`, `Lu-Dt-Ess`, `Lu-Dt-End`, `Lu-Dt-Eu`, `Lu-Df-Ess`, `Lu-Df-End`, `Lu-Du-Ess`, `Lu-Du-End`

### `clipprogress-should-be-lipsync`

- **Stelle:** `src/components/video-composer/SceneClipProgress.tsx:132`
- **Zweck:** Szene gilt als Lip-Sync-Szene (Spinner/Warnungen)
- **Heutige Bedingung:** `engineOverride === 'cinematic-sync' || dialogMode === true || lipSyncWithVoiceover === true`
- **parity:** `mixed`
- **False positives (7)** — Gate true, SSoT false: `Lf-Dt-Eauto`, `Lf-Dt-Ecs`, `Lf-Dt-Ess`, `Lf-Dt-End`, `Lf-Dt-Eu`, `Lf-Df-Ecs`, `Lf-Du-Ecs`
- **False negatives (4)** — SSoT true, Gate false: `Lu-Df-Ess`, `Lu-Df-End`, `Lu-Du-Ess`, `Lu-Du-End`

### `inlineplayer-needs-lipsync`

- **Stelle:** `src/components/video-composer/SceneInlinePlayer.tsx:76`
- **Zweck:** Grüner Haken erst nach Lip-Sync (Intent-Anteil)
- **Heutige Bedingung:** `scene.engineOverride === 'cinematic-sync' || isLipSyncIntentional(scene)`
- **parity:** `broader`
- **False positives (3)** — Gate true, SSoT false: `Lf-Dt-Ecs`, `Lf-Df-Ecs`, `Lf-Du-Ecs`
- **False negatives (0)** — SSoT true, Gate false: —

### `inlineplayer-legacy-happyhorse-warn`

- **Stelle:** `src/components/video-composer/SceneInlinePlayer.tsx:224`
- **Zweck:** Warnung "Lip-Sync auf veraltetem Video" (Intent-Anteil)
- **Heutige Bedingung:** `scene.engineOverride === 'cinematic-sync'`
- **parity:** `mixed`
- **False positives (3)** — Gate true, SSoT false: `Lf-Dt-Ecs`, `Lf-Df-Ecs`, `Lf-Du-Ecs`
- **False negatives (20)** — SSoT true, Gate false: `Lt-Dt-Eauto`, `Lt-Dt-Ess`, `Lt-Dt-End`, `Lt-Dt-Eu`, `Lt-Df-Eauto`, `Lt-Df-Ess`, `Lt-Df-End`, `Lt-Df-Eu`, `Lt-Du-Eauto`, `Lt-Du-Ess`, `Lt-Du-End`, `Lt-Du-Eu`, `Lu-Dt-Eauto`, `Lu-Dt-Ess`, `Lu-Dt-End`, `Lu-Dt-Eu`, `Lu-Df-Ess`, `Lu-Df-End`, `Lu-Du-Ess`, `Lu-Du-End`

### `clipstab-locks-user-duration`

- **Stelle:** `src/components/video-composer/ClipsTab.tsx:445`
- **Zweck:** Nutzer-Dauer wird gegen die gemessene Clip-Dauer verteidigt
- **Heutige Bedingung:** `engineOverride === 'cinematic-sync' || engineOverride === 'sync-segments'`
- **parity:** `mixed`
- **False positives (6)** — Gate true, SSoT false: `Lf-Dt-Ecs`, `Lf-Dt-Ess`, `Lf-Df-Ecs`, `Lf-Df-Ess`, `Lf-Du-Ecs`, `Lf-Du-Ess`
- **False negatives (14)** — SSoT true, Gate false: `Lt-Dt-Eauto`, `Lt-Dt-End`, `Lt-Dt-Eu`, `Lt-Df-Eauto`, `Lt-Df-End`, `Lt-Df-Eu`, `Lt-Du-Eauto`, `Lt-Du-End`, `Lt-Du-Eu`, `Lu-Dt-Eauto`, `Lu-Dt-End`, `Lu-Dt-Eu`, `Lu-Df-End`, `Lu-Du-End`

### `clipstab-poll-cinematic`

- **Stelle:** `src/components/video-composer/ClipsTab.tsx:550`
- **Zweck:** 3s-Polling läuft weiter, solange Lip-Sync arbeitet (Intent-Anteil)
- **Heutige Bedingung:** `s.engineOverride === 'cinematic-sync'`
- **parity:** `mixed`
- **False positives (3)** — Gate true, SSoT false: `Lf-Dt-Ecs`, `Lf-Df-Ecs`, `Lf-Du-Ecs`
- **False negatives (20)** — SSoT true, Gate false: `Lt-Dt-Eauto`, `Lt-Dt-Ess`, `Lt-Dt-End`, `Lt-Dt-Eu`, `Lt-Df-Eauto`, `Lt-Df-Ess`, `Lt-Df-End`, `Lt-Df-Eu`, `Lt-Du-Eauto`, `Lt-Du-Ess`, `Lt-Du-End`, `Lt-Du-Eu`, `Lu-Dt-Eauto`, `Lu-Dt-Ess`, `Lu-Dt-End`, `Lu-Dt-Eu`, `Lu-Df-Ess`, `Lu-Df-End`, `Lu-Du-Ess`, `Lu-Du-End`

### `preflight-dialog-checks`

- **Stelle:** `src/components/video-composer/RenderPreFlightDialog.tsx:148`
- **Zweck:** Dialog-spezifische Preflight-Blocker (Cast/Skript)
- **Heutige Bedingung:** `s.dialogMode (truthy)`
- **parity:** `mixed`
- **False positives (5)** — Gate true, SSoT false: `Lf-Dt-Eauto`, `Lf-Dt-Ecs`, `Lf-Dt-Ess`, `Lf-Dt-End`, `Lf-Dt-Eu`
- **False negatives (16)** — SSoT true, Gate false: `Lt-Df-Eauto`, `Lt-Df-Ecs`, `Lt-Df-Ess`, `Lt-Df-End`, `Lt-Df-Eu`, `Lt-Du-Eauto`, `Lt-Du-Ecs`, `Lt-Du-Ess`, `Lt-Du-End`, `Lt-Du-Eu`, `Lu-Df-Ecs`, `Lu-Df-Ess`, `Lu-Df-End`, `Lu-Du-Ecs`, `Lu-Du-Ess`, `Lu-Du-End`

### `pipelineprogress-cinematic-generating`

- **Stelle:** `src/hooks/usePipelineProgress.ts:922`
- **Zweck:** Szene zählt als "in Arbeit" während Lip-Sync (Intent-Anteil)
- **Heutige Bedingung:** `s.engineOverride === 'cinematic-sync'`
- **parity:** `mixed`
- **False positives (3)** — Gate true, SSoT false: `Lf-Dt-Ecs`, `Lf-Df-Ecs`, `Lf-Du-Ecs`
- **False negatives (20)** — SSoT true, Gate false: `Lt-Dt-Eauto`, `Lt-Dt-Ess`, `Lt-Dt-End`, `Lt-Dt-Eu`, `Lt-Df-Eauto`, `Lt-Df-Ess`, `Lt-Df-End`, `Lt-Df-Eu`, `Lt-Du-Eauto`, `Lt-Du-Ess`, `Lt-Du-End`, `Lt-Du-Eu`, `Lu-Dt-Eauto`, `Lu-Dt-Ess`, `Lu-Dt-End`, `Lu-Dt-Eu`, `Lu-Df-Ess`, `Lu-Df-End`, `Lu-Du-Ess`, `Lu-Du-End`

### `generateall-needs-lipsync`

- **Stelle:** `src/hooks/useGenerateAllClips.ts:62`
- **Zweck:** Szene gilt erst nach Lip-Sync als pipeline-ready (Intent-Anteil)
- **Heutige Bedingung:** `scene.engineOverride === 'cinematic-sync'`
- **parity:** `mixed`
- **False positives (3)** — Gate true, SSoT false: `Lf-Dt-Ecs`, `Lf-Df-Ecs`, `Lf-Du-Ecs`
- **False negatives (20)** — SSoT true, Gate false: `Lt-Dt-Eauto`, `Lt-Dt-Ess`, `Lt-Dt-End`, `Lt-Dt-Eu`, `Lt-Df-Eauto`, `Lt-Df-Ess`, `Lt-Df-End`, `Lt-Df-Eu`, `Lt-Du-Eauto`, `Lt-Du-Ess`, `Lt-Du-End`, `Lt-Du-Eu`, `Lu-Dt-Eauto`, `Lu-Dt-Ess`, `Lu-Dt-End`, `Lu-Dt-Eu`, `Lu-Df-Ess`, `Lu-Df-End`, `Lu-Du-Ess`, `Lu-Du-End`

### `mouthprobe-cinematic`

- **Stelle:** `src/hooks/useMouthYavgProbe.ts:41`
- **Zweck:** Mouth-Y-Probe läuft überhaupt
- **Heutige Bedingung:** `scene.engineOverride === 'cinematic-sync'`
- **parity:** `mixed`
- **False positives (3)** — Gate true, SSoT false: `Lf-Dt-Ecs`, `Lf-Df-Ecs`, `Lf-Du-Ecs`
- **False negatives (20)** — SSoT true, Gate false: `Lt-Dt-Eauto`, `Lt-Dt-Ess`, `Lt-Dt-End`, `Lt-Dt-Eu`, `Lt-Df-Eauto`, `Lt-Df-Ess`, `Lt-Df-End`, `Lt-Df-Eu`, `Lt-Du-Eauto`, `Lt-Du-Ess`, `Lt-Du-End`, `Lt-Du-Eu`, `Lu-Dt-Eauto`, `Lu-Dt-Ess`, `Lu-Dt-End`, `Lu-Dt-Eu`, `Lu-Df-Ess`, `Lu-Df-End`, `Lu-Du-Ess`, `Lu-Du-End`


## Sichtbarkeit der Differenzen

| Differenzklasse | Nutzerseitig sichtbar? | Bewertung |
|---|---|---|
| Toggle-Veto ignoriert (`Lf-*-Ecs`) | Ja — Lip-Sync-UI/Spinner/Aktionen erscheinen bei ausgeschaltetem Toggle | Echter Widerspruch zur v245-Semantik |
| `lipSyncWithVoiceover=true` ohne Engine (`Lt-*-Eauto/Eu`) | Ja — Lip-Sync-Anzeigen fehlen, obwohl der Toggle AN ist | Praktisch selten, da die Toggles Engine mitschreiben |
| `sync-segments` / `native-dialogue` nicht erkannt (`*-Ess`, `*-End`) | Ja bei manuell gewählter Engine | Nur `cinematic-sync`-Gates betroffen |
| `dialogMode`-only-Gates gegen Toggle-Veto (`Lf-Dt-*`) | Ja — Dialog-Studio/Preflight bleiben aktiv | Bewusst zu prüfen: Dialog-Studio ist auch ohne Lip-Sync sinnvoll |

Wichtig für Schritt 2: Die Toggles in `SceneCard` schreiben `dialogMode`,
`engineOverride` und `lipSyncWithVoiceover` gemeinsam. Die widersprüchlichen
Kombinationen entstehen deshalb primär aus **Altbestand** und aus
programmatischen Settern (Briefing-Apply, Produktionsplan, Studio), nicht aus
dem normalen Klickpfad.

## Empfehlung für Schritt 2 (noch nicht umgesetzt)

| Gate | Empfehlung |
|---|---|
| `clipprogress-is-cinematic`, `clipprogress-should-be-lipsync`, `clipstab-poll-cinematic`, `pipelineprogress-cinematic-generating`, `inlineplayer-needs-lipsync`, `inlineplayer-legacy-happyhorse-warn`, `scenecard-lipsync-actions` | **umstellen** — reine Anzeige-/Polling-Gates; Parität ist hier gewünscht und risikoarm |
| `generateall-needs-lipsync`, `dialogstudio-force-cinematic`, `dialogstudio-wants-lipsync` | **umstellen, aber einzeln** — sie beeinflussen Kosten/Runs; je Gate eigener Nachweis |
| `scenecard-dialog-model-picker`, `scenecard-dialog-studio-entry`, `scenecard-dialog-studio-mount`, `preflight-dialog-checks` | **bewusst belassen (Vorschlag)** — sie bilden „Dialogszene" ab, nicht „Lip-Sync-Absicht"; Dialog ohne Lip-Sync bleibt ein gültiger Zustand |
| `scenecard-engine-migration`, `scenecard-dialog-preflight`, `clipstab-locks-user-duration`, `mouthprobe-cinematic` | **bewusst belassen** — engine-/providergebunden (v425-Vertrag), nicht intentgebunden |
| `scenecard-native-dialogue-verbatim` | **bewusst belassen** — Prompt-Modus hängt am konkreten Provider, nicht an der Lip-Sync-Absicht |

## Scanner-Inventar (eingefroren)

74 lesende Intent-Verwendungen in Bedingungskontexten über 20 Dateien; die
Zählung pro Datei steht als Allowlist im Scanner-Test. Jede zusätzliche Stelle
lässt den Test rot laufen. Nicht erfasst (bewusst): Writer und Mapping —
Objekt-Properties mit Intent-Feldnamen, Payload-Bau, Persistenz und Rollback.

## Offene Posten (nur referenziert, nicht Teil von v430.1)

- 8 Legacy-Output-Zeilen aus der Zeit vor v430 (Resolver-Verhalten legacy-paritätisch) → v431.
- `compose-video-assemble` liest weiterhin `clip_url` direkt statt `resolveSceneOutput()` → v431.
- 36 verwaiste `reserved`-Credit-Reservierungen → separater operativer Auftrag.
- Deno-Test `scene-state-write-contract` meldet `qa-watchdog` und `recover-stuck-composer-clip` als Offender; vor v431 ist zu klären, ob die Prüfung veraltet ist oder eine echte Vertragslücke zeigt.
