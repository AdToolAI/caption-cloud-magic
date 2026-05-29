# Dialog-Pipeline: Pivot zu Sync.so Segments — STATUS: SHIPPED

**Umgesetzt:**
- `compose-dialog-segments` edge function (1-Call Sync.so Segments, deployed)
- `sync-so-webhook` v5 branch (COMPLETED → clip_url; FAILED → idempotenter Refund, deployed)
- `useTwoShotAutoTrigger`: `DIALOG_ENGINES = {cinematic-sync, sync-segments}`, v5 stale-watchdog (12min), `syncso_segments_*` in RETRYABLE_REGEX
- `sceneEngineRouter.ts` + Type: `'sync-segments'` als erste Klasse, Label + Reason
- `SceneCard.tsx` Select: neuer Eintrag **⚡ Fast Dialog · 1-Call (Sync.so Segments)**
- Memory: `mem://features/video-composer/sync-segments-dialog-pipeline`



Mein vorheriger Plan ("HappyHorse als nativer Dialog-Renderer") ist **technisch nicht umsetzbar** — HappyHorse 1.0 hat keine Multi-Speaker-API. Auch der "Artlist macht das so"-Vergleich war Spekulation: Artlist betreibt nur ein Aggregator-Frontend über bestehende Modelle (Veo 3, Kling, Hailuo, HappyHorse), keine eigene Dialog-Engine.

**Die echte Lösung für das Problem (15 min Chain, hohe Fehlerrate) ist** die **Sync.so Segments API** — die ist bereits in unserem Stack, kann nativ Multi-Speaker in **1 Call** lipsyncen, und wir nutzen ihre Single-Speaker-Variante schon (`sync/lipsync-2-pro`).

## Architektur-Vergleich

```text
HEUTE (Chain, ~10–15 min, mehrere Failure-Points):
  Hailuo i2v plate  →  Sync.so call #1 (turn 1)
                    →  Sync.so call #2 (turn 2)
                    →  Sync.so call #3 (turn 3)
                    →  ffmpeg concat  →  done

NEU (Sync.so Segments, 1 Call, ~3–5 min):
  Hailuo i2v plate (1 plate mit beiden Sprechern im Frame)
    →  Sync.so 1× Call mit segments[]
       [{ audio: vo_a, start: 0,   end: 2.5, face: "left"  },
        { audio: vo_b, start: 2.5, end: 5,   face: "right" },
        { audio: vo_a, start: 5,   end: 8,   face: "left"  }]
    →  done
```

## Plan

### 1. Neue Edge Function `compose-dialog-segments`
- Input: `sceneId`, `master_plate_url` (Hailuo i2v mit allen Sprechern im Frame), `dialog_script[]` mit speaker + audio_url + start/end pro Turn, `face_assignments` (welche Bildregion = welcher Speaker).
- Baut 1× Sync.so-Call mit `segments[]` (siehe https://sync.so/docs/developer-guides/segments).
- Webhook-driven (wie heute), schreibt `clip_url` direkt in `composer_scenes`.
- Idempotenter Refund bei Fehler (deterministische UUID aus scene_id + segment_count).

### 2. Engine-Override
- Neuer Wert `engine_override = 'sync-segments'` parallel zu `cinematic-sync`.
- Default für neue Multi-Sprecher-Szenen: `sync-segments`.
- UI-Toggle pro Szene: "Fast Dialog (1 Call)" vs "Legacy Chain".

### 3. Face-Region-Detection (1× pro Scene)
- Nach Master-Plate-Generation: `gemini-2.5-flash` Vision-Call → bbox pro Cast-Member im Frame.
- Cache in `composer_scenes.face_regions` (jsonb).
- Sync.so Segments akzeptiert face-bbox oder face-index — wir wählen das was die API verlangt.

### 4. Legacy bleibt als Fallback
- `compose-dialog-scene` + `poll-dialog-shots` bleiben unverändert.
- Auto-Fallback nach `sync-segments` Failure (max 1 Retry, dann Chain).
- Single-Speaker-Szenen unverändert.

### 5. Feature-Flag-Rollout
- `system_config.dialog_engine_default = 'sync-segments' | 'cinematic-sync'`.
- Start: `cinematic-sync` (Default), neuer Toggle im UI.
- Nach ≥90% Erfolg über 30 Runs → Auto-Switch auf `sync-segments` als Default.

### 6. UI-Anpassung
- `DialogScenePhaseDisplay` bekommt 2-Phasen-Modus für `sync-segments` (Polling → Done).
- Cinematic-Sync behält 5-Phasen-Anzeige.

## Was unverändert bleibt
- Audio-Pipeline (VO-Generation, audio_plan.tracks[])
- `compose-dialog-scene`, `poll-dialog-shots`, `render-dialog-stitch`, `sync-so-webhook`
- Single-Speaker-Szenen
- Composer-UI, Credits, Refund-Logik

## Risiken / offene Punkte
- **Sync.so Segments + Face-Detection-Reliability**: Wenn beide Sprecher zu nah / überlappen, kann face-assignment scheitern → Fallback auf Chain.
- **Master-Plate-Qualität**: Hailuo muss beide Sprecher stabil im Frame halten — dafür nutzen wir bereits unser Multi-Character-Composition (`portraitUrls[]` an `compose-scene-anchor`). Funktioniert.
- **Pricing**: Sync.so lipsync-2-pro $0.083/s × 8s = ~$0.67 statt heute ~$2.00 (3 Calls). **Günstiger** als Chain.
- **Max Speakers**: Sync.so detected mehrere Faces automatisch — kein harter 2-Sprecher-Cap wie bei MultiTalk.

## Was wir NICHT bauen
- ❌ HappyHorse als Dialog-Renderer (API kann es nicht)
- ❌ MeiGen MultiTalk (max 2 Sprecher, ~7min, kein Brand-Identity-Lock)
- ❌ Veo 3 Dialog (keine Reference-Faces = killt Avatar-System)

## Tech-Details
- Sync.so Segments Doc: https://sync.so/docs/developer-guides/segments
- Replicate Model: `sync/lipsync-2-pro` (bereits in unserem Stack)
- Memory-Update nach Erfolg: neue Notiz `mem://features/video-composer/sync-segments-dialog-pipeline`