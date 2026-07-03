## Ziel

Den alten HeyGen-/Talking-Head-Pfad im **Video Composer** endgültig entfernen, damit Dialog-/Voiceover-Szenen ausschließlich über die **v169 Cinematic-Sync Pipeline** (HappyHorse/Hailuo Master-Plate → Sync.so Lipsync) laufen. Keine Möglichkeit mehr, dass eine Szene versehentlich als statischer Portrait-Talking-Head „ready" markiert wird.

Der Talking-Head bleibt als eigenständiges Modul (`/talking-head`) bestehen — er wird nur aus dem Composer-Routing entfernt.

## Änderungen

### 1. Composer-Server: HeyGen-Branch komplett entfernen
`supabase/functions/compose-video-clips/index.ts`
- Den kompletten `wantsHeygen`-Block (~L2185–2530) löschen inklusive:
  - Hume-Voice-Pre-Synth speziell für HeyGen
  - `fetch(...generate-talking-head)`-Aufruf
  - HeyGen-spezifische Fehlerbehandlung/Refund
- `engineOverride === 'heygen'` als Wert entfernen. Wenn der Wert reinkommt, wird er auf `'cinematic-sync'` normalisiert (bei Dialog) oder auf `'auto'` (ohne Dialog).
- Der bestehende Cinematic-Sync-Guard (L1157–1180) bleibt und wird zur einzigen Route für Dialog/Voiceover.

### 2. Composer-Client: HeyGen-Option aus Engine-Wahl entfernen
- Engine-Override-Werte `'heygen'` aus TypeScript-Typen entfernen (`ComposerScene`, `useSceneGenerate`, `SceneDialogStudio`, Router-Helper).
- Alle UI-Elemente/Buttons, die „HeyGen" oder „Talking-Head" im Composer-Kontext anbieten, ausblenden bzw. auf Cinematic-Sync umstellen.
- Der eigenständige Talking-Head Modus-Tab in `SceneDialogStudio` (falls vorhanden) bleibt nur als Info-Hinweis „für Portraits nutze das eigene Talking-Head-Modul".

### 3. Legacy Talking-Head URLs erkennen und blockieren
`compose-clip-webhook` und `compose-video-clips`:
- Wenn eine Cinematic-Sync-Szene doch eine `talking-head-renders/...`-URL als `clip_url` bekommt, wird sie NICHT `ready` gesetzt, sondern:
  - `clip_status='failed'`
  - `clip_error='legacy_talking_head_route_blocked'`
  - `lip_sync_status`, `twoshot_stage`, `dialog_shots` gecleart
- Idempotenter Credit-Refund über bestehende Refund-Utility.

### 4. Datenmigration für bereits „ready" markierte Fehlläufer
Einmalige Migration:
- Alle `composer_scenes` mit `clip_url LIKE '%/talking-head-renders/%'` UND `lip_sync_with_voiceover=true` OR `engine_override IN ('cinematic-sync','sync-segments')`:
  - `clip_status='failed'`, `clip_error='legacy_talking_head_route_removed'`, `clip_url=null`
  - Damit erscheinen die betroffenen Szenen im UI als „Neu generieren" statt fälschlich als fertig.

### 5. `useSceneGenerate` / `SceneDialogStudio` vereinfachen
- `shouldForceCinematicSync` wird zum Default: Jede Szene mit `dialogScript` + Cast + Provider ∈ {ai-happyhorse, ai-hailuo} bekommt zwingend `engine_override='cinematic-sync'`.
- Die Fallback-Rewrite-Logik, die HeyGen für 1-Sprecher-Szenen erlaubte, wird gelöscht.
- Die „Sauber neu starten"-Warnung in `SceneClipProgress` bleibt als Sicherheitsnetz für Alt-Szenen.

### 6. Verifikation
- Testszene aus dem Screenshot (Samuel Dusatko, 5s HappyHorse, Voiceover) neu triggern → DB muss:
  - `engine_override='cinematic-sync'`
  - `lip_sync_with_voiceover=true`
  - `clip_status='generating'` → `ready`
  - `clip_url` unter `composer-renders/…` (nicht `talking-head-renders/…`)
- `compose-video-clips` Edge Logs zeigen keinen `fetch(.../generate-talking-head)`-Call mehr für Composer-Szenen.

## Nicht Teil dieses Plans

- Das eigenständige Talking-Head-Modul (`/talking-head`, `useTalkingHead`, `generate-talking-head` Edge Function) bleibt unverändert und weiter nutzbar für dediziertes Portrait-Lipsync außerhalb des Composers.
- v169 Sync.so-Pipeline-Interna (per-pass locks, ASD, preclip) — bleiben wie im letzten Fix.

## Technische Dateien

- `supabase/functions/compose-video-clips/index.ts` (HeyGen-Branch löschen)
- `supabase/functions/compose-clip-webhook/index.ts` (Legacy-URL-Guard)
- `src/hooks/useSceneGenerate.ts`
- `src/components/video-composer/SceneDialogStudio.tsx`
- `src/components/video-composer/SceneClipProgress.tsx`
- `src/lib/video-composer/sceneEngineRouter.ts` (falls vorhanden)
- `src/types/video-composer.ts`
- Neue Migration: `remove_legacy_talking_head_composer_rows.sql`

## Ergebnis

Nach Umsetzung gibt es im Composer nur noch **einen** Weg für Dialog/Voiceover — Cinematic-Sync. Ein „schwarzer Clip, der eigentlich ein alter Portrait-Talking-Head war" ist damit strukturell unmöglich.