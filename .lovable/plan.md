## Ziel
HeyGen/Talking-Head-Pfad komplett aus dem Video Composer entfernen. `/talking-head` Standalone-Modul bleibt unberührt. Composer nutzt ausschließlich die v169/v183 Sync.so-Pipeline.

## Änderungen

### 1. Client — SceneDialogStudio.tsx
- `useTalkingHead()` Import und `handleGenerateInline()` HeyGen-Aufruf entfernen
- `useHeygenLipSync` / Auto-Upgrade-Block entfernen
- Inline "Generate" für Dialog/Voiceover-Szenen persistiert stattdessen:
  - `engine_override='cinematic-sync'`
  - `lip_sync_with_voiceover=true`
  - `lip_sync_status='pending'`
  - `twoshot_stage='audio'` (nach Audio-Erzeugung)
- Danach übernimmt `compose-video-clips` den Master-Plate-Render + Sync.so Lip-Sync

### 2. Client — SceneCard.tsx / ClipsTab / sceneEngineRouter.ts / lib/video-composer.ts
- Alle verbleibenden `heygen` / `heygen-talking-head` Referenzen entfernen bzw. auf `cinematic-sync` normalisieren
- Engine-Typ `heygen-talking-head` aus dem Composer-TypeScript raus (Standalone `/talking-head` betroffen? Nein, das nutzt eigenen Typ)

### 3. Briefing / Manifest
- `heygen` Enum-Werte in Composer-Briefings entfernen oder beim Load auf `cinematic-sync` normalisieren

### 4. Server — compose-video-clips/index.ts
- Hard-Guard am Anfang: `engineOverride==='heygen'` → auf `'cinematic-sync'` normalisieren + Log
- Jede eingehende `clip_url` mit `talking-head-renders/` → sofort `failed` mit `legacy_talking_head_route_blocked`

### 5. Datenbank-Migration
- Alle `composer_scenes` mit `clip_url LIKE '%talking-head-renders%'` und `clip_status='ready'` → `failed` + Reset (`lip_sync_status=null`, `twoshot_stage=null`, `dialog_shots=null`, `lip_sync_source_clip_url=null`)
- Alle `engine_override='heygen'` → `'cinematic-sync'`

### 6. Verifikation
- `rg` nach `generate-talking-head`, `useTalkingHead`, `heygen-talking-head`, `talking-head-renders` außerhalb von `src/pages/talking-head/**` und `supabase/functions/generate-talking-head/**` → 0 Treffer erwartet
- DB-Query: 0 aktive `ready`-Composer-Szenen mit `talking-head-renders`
- Deno-Parse für Edge Functions, Deploy `compose-video-clips`

## Nicht betroffen
- `/talking-head` Standalone-Route inkl. `generate-talking-head` Edge Function
- Sync.so v169/v183 Pipeline (`compose-dialog-segments`, `render-sync-segments-audio-mux`)
- Bestehende, bereits fertige HeyGen-Clips außerhalb des Composers

## Ergebnis
Composer kann keine `talking-head-renders`-URLs mehr erzeugen oder anzeigen. Dialog-Szenen mit Cast laufen durchgängig über HappyHorse/Hailuo → Sync.so → composer-renders.
