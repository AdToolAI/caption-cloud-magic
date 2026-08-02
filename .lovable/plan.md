# v385 — Enum-Umbau zu Ende bringen

## Ist-Zustand (verifiziert)
- Neu genutzt (`transitionScene` / `pipeline_state`): `composer-start-scene-generation`, `compose-twoshot-audio`, `_shared/scene-state.ts`, Client `sceneState.ts` / `isRealizedScene.ts`, `useTwoShotAutoTrigger.ts`.
- Noch Legacy: ca. 48 Dateien schreiben oder lesen weiterhin `clip_status` / `twoshot_stage` / `lip_sync_status` direkt. Schwerpunkte: `compose-dialog-segments` (61), `compose-video-clips` (40), `sync-so-webhook` (22), `render-sync-segments-audio-mux` (12), `compose-clip-webhook` (11), `lipsync-watchdog` (8), `remotion-webhook` (7), `_shared/clip-terminal-failure.ts` (7), `qa-watchdog` (5).
- Fazit: Der Zustand ist noch nicht Single-Source-of-Truth; die Bridge-Trigger halten das System nur zusammen.

## Ziel
`pipeline_state` ist der einzige geschriebene Zustand. Legacy-Spalten werden ausschließlich vom DB-Trigger gepflegt und nirgends mehr in Code geschrieben oder für Kontrollfluss gelesen.

## Umsetzung in vier Wellen

### Welle A — Terminal- und Abbruchpfade (höchster Nutzen)
Auf `transitionScene(... 'failed' | 'canceled')` umstellen:
`_shared/clip-terminal-failure.ts`, `_shared/lipsync-fail.ts`, `composer-cancel-scene`, `composer-cancel-project`, `cancel-dialog-lipsync`, `reset-lipsync-scene`, `_shared/scene-hard-reset.ts`.
Damit gilt: ein „failed" ist ein validierter Übergang mit Run-/Generations-Prüfung — veraltete Callbacks können eine Szene nicht mehr reaktivieren.

### Welle B — Plate-Pfad
`compose-video-clips` (`plate_queued` → `plate_rendering`), `compose-clip-webhook` und `remotion-webhook` (`plate_ready` / `failed`), `compose-scene-anchor`, `generate-composer-image-scene`, `hybrid-extend-scene`.
Jeder Übergang bekommt `runId` + `generation` mit; abgelehnte Übergänge werden geloggt statt still ignoriert.

### Welle C — Dialog-/Lip-Sync-Pfad
`compose-dialog-segments` (`audio_ready` → `lipsync_dispatched`), `sync-so-webhook` (`lipsync_running` → `lipsync_muxing` → `complete`), `render-sync-segments-audio-mux`, `report-lipsync-motion-probe`, `compose-stitch-and-handoff`, `compose-video-assemble`.
Das ist die größte Datei-Menge; hier ersetzt der Zustandsautomat die verstreuten Stage-Strings.

### Welle D — Watchdogs, Autopilot, Client-Leser
`lipsync-watchdog`, `qa-watchdog`, `qa-weekly-deep-sweep`, `recover-stuck-composer-clip`, `_shared/autopilotComposerBridge.ts`, `auto-director-compose`, `motion-studio-superuser`, `generate-talking-head`.
Client: `usePipelineProgress`, `useSceneGenerate`, `useGenerateAllClips`, `useRenderQueueLive`, `useComposerPersistence`, `useApplyProductionPlan`, `ClipsTab`, `SceneCard`, `AnchorPreviewGate`, `SceneInlinePlayer`, `FaceMapReviewDialog`, `VideoComposerDashboard`, `RenderQueue`, `DebugLipsync`, `StudioMode`, `sceneSnapshot.ts`, `lipSyncPending.ts` — lesen nur noch über `sceneState()` / `SCENE_STATE_LABEL`.

### Welle E — Sperre und Beweis
1. DB-Trigger `composer_scenes_reject_legacy_writes`: direkte Schreibzugriffe auf die drei Legacy-Spalten ohne begleitendes `pipeline_state` werden abgelehnt (Ausnahme: der Bridge-Trigger selbst).
2. Guard-Test im Repo (wie beim AWS-only-Probe-Guard): schlägt fehl, sobald irgendwo `clip_status:` / `twoshot_stage:` / `lip_sync_status:` in einem Update-Payload auftaucht.
3. `composer-reset-selftest` um Zustands-Assertions erweitern: nach Reset muss `pipeline_state = 'idle'` und Legacy-Spiegel konsistent sein.

## Technische Details
- Jeder `transitionScene`-Aufruf übergibt `runId` und `generation`; die RPC `composer_scene_transition` lehnt Übergänge veralteter Läufe ab. Abgelehnte Übergänge werden mit `v385_stale_transition` protokolliert, nicht als Fehler eskaliert.
- Bridge-Trigger bleibt zunächst aktiv (Rückwärtskompatibilität für Analytics/Views) und wird erst nach zwei stabilen Wochen entfernt.
- Keine Schema-Änderung nötig außer dem Reject-Trigger in Welle E.

## Risiko und Reihenfolge
Wellen A–C sind unabhängig deploybar; nach jeder Welle empfiehlt sich ein realer Szenenlauf zur Verifikation. Welle E erst starten, wenn A–D vollständig sind, sonst blockiert der Reject-Trigger noch nicht migrierte Funktionen.
