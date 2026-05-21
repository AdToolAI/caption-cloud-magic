## Befund

Backend ist umgebaut, **UI nicht**. Konkret:

1. **Badges zeigen noch "Two-Shot · N Sprecher"** und "HeyGen Lip-Sync (N Sprecher)" (`SceneCard.tsx:746`, `sceneEngineRouter.ts:78,126`).
2. **Manueller Render-Button in `SceneCard.tsx:1672-1763`** ruft hartkodiert `compose-twoshot-lipsync` / `compose-lipsync-scene` auf — komplett am neuen Pfad vorbei.
3. **`SceneDialogStudio.tsx:924-1055,1391-1443`** Two-Shot-Manuell-Trigger + Texte "🎭 Two-Shot in echte Szene einbauen".
4. **`SceneClipProgress.tsx:113-195,381-390`** zeigt die alten 6-Stage Two-Shot-Bars (`audio → anchor → master_clip → lipsync_1 → lipsync_2 → done`) statt der neuen Shot-Liste aus `dialog_shots`.
5. **`sceneEngineRouter.ts`** Engine-Auswahl labelt Cinematic-Sync immer noch als "HeyGen Two-Shot".
6. Auto-Trigger ruft korrekt `compose-dialog-scene` auf, pollt aber noch über `poll-twoshot-lipsync` statt sich auf den serverseitigen `poll-dialog-shots` Cron zu verlassen.

Der Auto-Trigger funktioniert also — aber jeder manuelle Klick und jede Status-Anzeige hängt noch am alten System. Deshalb sehen wir auch noch "Two-Shot · 2 Sprecher".

## Umbau

### 1. Badges & Labels (rein Text)
- `SceneCard.tsx:737-749` → `Dialog-Shots · N Sprecher` (+ Tooltip auf neuen Pipeline-Text).
- `sceneEngineRouter.ts:78,122-128` → `🎭 Cinematic Dialog · N Sprecher` mit Beschreibung "1 Shot + Lip-Sync pro Sprecher-Turn, beliebig viele Personen".
- `SceneDialogStudio.tsx:1391,1440-1443` → "Cinematic Dialog in Szene rendern".

### 2. Manuelle Render-Pfade auf neue Function umbiegen
- `SceneCard.tsx:1672-1763`: gesamten `twoshotSpeakers`-Block + `fnName = speakers>=2 ? 'compose-twoshot-lipsync' : 'compose-lipsync-scene'` ersetzen durch einen einzigen `supabase.functions.invoke('compose-dialog-scene', { body: { scene_id } })`-Aufruf. Vorab nur `twoshot_stage: null` + `lip_sync_status: 'pending'` resetten.
- `SceneDialogStudio.tsx:924-1055`: gleicher Umbau — der manuelle "Two-Shot rendern"-Button ruft `compose-dialog-scene` auf, kein eigenes `twoshotStage: 'audio'` Vorab-Setzen mehr.

### 3. Progress-Overlay auf Shot-Liste
- `SceneClipProgress.tsx`: alten 6-Stage Block (`TWO_SHOT_STAGES`) ersetzen durch eine kompakte Liste aus `scene.dialog_shots ?? []`. Pro Shot eine Zeile: `Shot {i+1} · {speaker} · {status}` mit Icons (queued/rendering/lipsyncing/ready/failed). Headline "🎭 Dialog-Shots · {ready}/{total}".
- Fallback: wenn `dialog_shots` leer aber `engine_override='cinematic-sync'` und `lip_sync_status='running'`, zeige generischen "Audio wird vorbereitet…"-Step (entspricht Pre-Insert-Phase von `compose-dialog-scene`).

### 4. Auto-Trigger entrümpeln
- `useTwoShotAutoTrigger.ts`: Den `poll-twoshot-lipsync`-Aufruf (Zeile 113) entfernen — `poll-dialog-shots` läuft serverseitig per pg_cron. Stale-Recovery (Zombie-Stage, preflight-abort) bleibt, wird aber auch auf `dialog_shots`-Stati erweitert: shots, die >12min in `rendering`/`lipsyncing` hängen, markieren wir als failed → Hook-eigener Refund über `poll-dialog-shots` greift.
- Datei umbenennen ist optional — Funktionalität bleibt, Trigger ist generisch.

### 5. `usePipelineProgress.ts` + `useGenerateAllClips.ts`
- Bedingungen `twoshotStage in (audio|anchor|master_clip|lipsync_*)` ersetzen durch: "scene ist `cinematic-sync` UND (`lip_sync_status='running'` ODER es gibt mindestens einen `dialog_shots[i].status` != `ready`)". So bleibt die Pipeline-Progress-Bar korrekt.

### 6. Texte/Kommentare
- "Two-Shot Hook" → "Dialog-Shots" überall in DE/EN/ES.
- Die JSDoc-Header von `useTwoShotAutoTrigger.ts`, `SceneClipProgress.tsx`, `SceneDialogStudio.tsx` updaten.

### Nicht in diesem Schritt
- `compose-twoshot-lipsync`, `compose-twoshot-audio`, `poll-twoshot-lipsync` Edge Functions **bleiben deployed** als Safety-Net, bis 1 grüne Woche durchgelaufen ist. Erst dann löschen.
- `twoshot_stage` Spalte bleibt im Schema (Watchdog liest sie noch).

## Akzeptanztest

1. **Bestehende 2-Sprecher-Szene** neu rendern → Badge zeigt "Dialog-Shots · 2 Sprecher", Progress zeigt 2 Shots, beide kommen ready durch, beide Sätze haben Lippenbewegung.
2. **3-Sprecher-Skript** ("Anna: ... / Ben: ... / Cara: ...") → Badge "Dialog-Shots · 3 Sprecher", 3 Shots in Progress-Liste, finaler Clip enthält 3 korrekt gemundete Schnitte.
3. **Manueller Render-Button** in `SceneCard` und `SceneDialogStudio` löst denselben Pfad aus wie Auto-Trigger (kein Aufruf an `compose-twoshot-lipsync` mehr in Network-Logs).
