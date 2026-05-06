## Goal
Im Motion Studio (Composer → Clips-Tab) soll **jede einzelne Szene** über einen kleinen Button manuell in der Mediathek gespeichert werden können — Auto-Save bleibt bewusst aus, damit die Library nicht mit Throwaway-Szenen vollläuft.

## UX

In der `ClipsTab`-Szenenleiste (rechts neben "Neu generieren" / "Continuity → #X") erscheint bei jeder Szene mit `clipStatus === 'ready'` und vorhandener `clipUrl` ein neuer Button:

- Icon: `Save` (lucide)
- Text: **"In Mediathek"** (nach erfolgreichem Save: **"Gespeichert ✓"**, disabled)
- Style: konsistent zu den anderen 7-px-Outline-Buttons (gold-Akzent, James-Bond-2028-Tokens — keine hardcoded Farben)
- Tooltip: *"Diese Szene als eigenständigen Clip in deiner Mediathek ablegen"*

Toast bei Erfolg: *"Szene in Mediathek gespeichert"* mit Action-Button *"Öffnen"* → `/video-management`.

## Technische Umsetzung

### 1. Neue Edge Function `save-composer-scene-to-library`
   - Input: `{ project_id, scene_id, clip_url, prompt, duration_seconds, clip_source, clip_quality }`
   - Auth: Bearer-Token → `supabaseAdmin.auth.getUser(token)` (gleiches Pattern wie `repair-brand-character-urls`)
   - Schritte:
     1. Idempotenz-Check via `video_creations.metadata @> { composer_scene_id: scene_id }`
     2. Download der `clip_url` (Replicate-CDN, 30 s Timeout) → Blob
     3. Upload nach `ai-videos/<user_id>/composer-<scene_id>.mp4` (gleicher Bucket wie Sora-Saves)
     4. Insert in `public.video_creations` mit `metadata = { source: 'video-composer', composer_scene_id, composer_project_id, prompt, clip_source, clip_quality }`, `credits_used: 0`
   - Refund-Verhalten: keine Credits berührt — Generierung wurde bereits separat bezahlt
   - `verify_jwt = false` in `supabase/config.toml` (Pattern wie repair-Function)

### 2. Neuer Hook `useSaveSceneToLibrary`
   - `src/hooks/useSaveSceneToLibrary.ts`, parallel zu `useAvatarPortrait` (loading, toast, queryClient invalidate für `['video-creations']` und `['media-library']`)
   - Returnt `{ save(scene, projectId), saving, savedSceneIds: Set<string> }` — letzteres aus `sessionStorage` gehydriert, damit Re-Mounts den "Gespeichert ✓"-Zustand behalten

### 3. UI-Integration
   - `src/components/video-composer/ClipsTab.tsx`: Hook importieren, Button im Action-Cluster (~Zeile 783, direkt nach "Re-roll") einfügen
   - Conditional rendering identisch zu Re-roll: `scene.clipStatus === 'ready' && scene.clipUrl`

### 4. Keine Schema-Änderung nötig
   - `video_creations` existiert mit `metadata jsonb` und akzeptiert beliebige Keys
   - `ai-videos`-Bucket existiert bereits und nutzt `<user_id>/...`-Pfad-Konvention (RLS-konform)

## Out of Scope
- Kein Auto-Save beim Generieren (bewusst — User-Wunsch)
- Kein Bulk-Save-All-Button (kann später nachgereicht werden)
- Keine Änderung am Render-Pipeline-Flow / Stitch-Output (der wird bereits separat persistiert)
