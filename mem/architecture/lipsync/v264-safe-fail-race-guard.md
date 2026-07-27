---
name: v264 Safe-Fail Race Guard (Cinematic-Sync)
description: compose-video-clips darf clip_status='failed' nicht mehr schreiben, wenn der async Hailuo+Sync.so+Mux-Pfad bereits einen clip_url produziert hat oder lip_sync_status ∈ {running,done} ist. safeMarkSceneFailed() erzwingt zusätzlich einen nicht-leeren clip_error und cleart bei Cinematic-Sync die Lipsync-Felder. SceneClipProgress blendet Lip-Sync-Bar bei clip_status='failed' aus.
type: architecture
---

# Symptom
Re-Render einer 4-Sprecher-Cinematic-Sync-Szene: alle 4 Sync.so-Passes done, Mux erfolgreich, `clip_url` frisch gesetzt — trotzdem stand `clip_status='failed'` mit `clip_error=NULL` und `lip_sync_status='done'` in der DB. UI: rote "Fehlgeschlagen"-Kachel UND laufende Lip-Sync-Progress-Bar gleichzeitig.

# Root Cause
Zwei Schreiber auf `composer_scenes` in derselben Sekunde:
1. Ein später Identity-Audit / Hard-Guard-Pfad in `compose-video-clips` schreibt `clip_status='failed'` (teils ohne `clip_error`).
2. Der Mux-Completion-Writer setzt `clip_url` + `lip_sync_status='done'` + `twoshot_stage='done'`.

Da beide `.update()` nur Teilfelder schreiben, überschreiben sie sich gegenseitig und hinterlassen widersprüchlichen Endzustand.

# Fix
1. `safeMarkSceneFailed(sceneId, msg, {isCinematicSyncScene, extra?})` in `supabase/functions/compose-video-clips/index.ts`:
   - Vor jedem failed-Write `select clip_url, lip_sync_status` prüfen.
   - Wenn `clip_url` gesetzt ODER `lip_sync_status ∈ {running,done}` → **kein** Status-Flip, nur `clip_error` als `[v264_safe_fail_skip] …`-Note ablegen.
   - Sonst normalen failed-Write via `failedClipUpdate()` ausführen, das Cinematic-Sync-Felder cleart.
2. `failedClipUpdate()` erzwingt jetzt immer einen `clip_error` (`unknown_failure_no_details` als Fallback).
3. Alle 6 direkten `.update({clip_status:'failed'})`-Aufrufe im Skript (legacy-talking-head, cinematic_sync_anchor_missing_single_speaker, v263 Attempt-3 Face-Lock, v195 anchor_missing, preview_gate_no_anchor, happyhorse_cinematic_sync_missing_anchor) durch `safeMarkSceneFailed` ersetzt.
4. Fatal-Catch (~Z. 4283) filtert `failedSceneIds` gegen live `clip_url`/`lip_sync_status`, rescued IDs bekommen nur eine Note statt Status-Flip.
5. Client: `SceneClipProgress.tsx` gated `lipSyncRunning` UND `isDialog` zusätzlich mit `scene.clipStatus !== 'failed'`.
6. Backfill-Migration: setzt bestehende Zeilen mit `clip_status='failed' + clip_url + lip_sync_status='done'` auf `ready` zurück.

# Invariant
`clip_status='failed'` bleibt strikt verboten, sobald der async Pfad `clip_url` gesetzt oder `lip_sync_status` auf `running`/`done` gehoben hat. Wer die Regel verletzt, produziert die "Fehlgeschlagen + Lip-Sync läuft"-Regression.

# Files
- `supabase/functions/compose-video-clips/index.ts`
- `src/components/video-composer/SceneClipProgress.tsx`
