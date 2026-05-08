
# In-Scene Lip-Sync via Sync.so (Industriestandard)

Wir nutzen die **Strategie 2** der großen Player: stummen AI-Clip generieren → Voiceover separat → Sync.so re-rendered nur den Mundbereich passend zum Audio. Ergebnis = **eine** Video-Datei pro Szene, Charakter steht in der Szene, Lippen wortgenau.

Gute Nachricht: 80 % ist schon da. `supabase/functions/lip-sync-video/index.ts` läuft bereits mit `sync/lipsync-2` auf Replicate, das Scene-Feld `lip_sync_with_voiceover` existiert in der DB. Es ist nur nirgends im Composer-Workflow verdrahtet.

## Was gebaut wird

### 1. Auto-Trigger nach Clip-Generierung
Wenn eine Szene fertiggerendert wird **und** `lipSyncWithVoiceover === true` **und** ein VO-Clip in `scene_audio_clips` (kind=`voiceover`) existiert:
- Edge-Function `compose-lipsync-scene` (neu, dünner Wrapper um `lip-sync-video`) wird aufgerufen
- nimmt `clip_url` (stummes Video) + VO-Audio-URL
- ruft Sync.so via Replicate, lädt Ergebnis in den `composer-clips` Bucket hoch
- ersetzt `composer_scenes.clip_url` mit dem lip-synced Video, setzt Flag `lip_sync_applied_at`
- idempotenter Credit-Refund bei Failure (Pflicht laut Memory)

### 2. UI: Lip-Sync Toggle pro Szene
In `SceneDialogStudio.tsx` neuer Switch direkt unter dem Dialog-Feld:
> 🎙️ **Lip-Sync** — Charakter spricht in der Szene wortgenau (+0.05 €/sec)

- Default: aus (günstiger, Voiceover läuft als Tonspur)
- An: Sync.so Post-Step wird automatisch nach Generate ausgelöst
- Badge auf SceneCard: "🎙️ Lip-Synced" wenn `lip_sync_applied_at` gesetzt

### 3. Manueller "Re-sync"-Button
Wenn VO oder Dialog nachträglich geändert wurde: Button "Lip-Sync neu rendern" auf der SceneCard, ruft dieselbe Edge-Function.

### 4. Preview & Export richtig handhaben
- `ComposerSequencePreview.tsx`: bei `lip_sync_applied_at != null` → den synced Clip abspielen, **VO-Audio-Track für diese Szene MUTEN** (sonst doppelt)
- `compose-video-assemble`: bei lip-synced Szenen → VO nicht zusätzlich muxen
- Bei Szenen **ohne** Lip-Sync: aktueller Voiceover-Tonspur-Fix bleibt (parallel abspielen)

### 5. Sicherheit & Credits
- Voraussetzung-Check: Clip muss existieren, VO-Audio muss existieren, beide URLs öffentlich erreichbar
- Cost-Estimate vorher anzeigen (basierend auf Clip-Dauer × 0.05€)
- Wallet-Balance-Check vor Sync.so Call
- Auto-Refund bei Replicate Fail/Timeout (deterministische UUID aus scene_id)
- Polling via `EdgeRuntime.waitUntil` (Sync.so braucht 30-90s)

## Architektur

```text
[Generate Scene Clip] → ai-hailuo/kling/etc → composer-clips bucket → composer_scenes.clip_url
        ↓
   lipSyncWithVoiceover && hasVoiceover?
        ↓ JA
[compose-lipsync-scene]
    ├─ fetch clip_url + vo_url
    ├─ replicate.run("sync/lipsync-2", { video, audio })
    ├─ upload → composer-clips/{userId}/{sceneId}-synced.mp4
    └─ UPDATE composer_scenes
         SET clip_url = synced_url,
             lip_sync_applied_at = now(),
             lip_sync_source_clip_url = original (für Re-sync)
        ↓
[Preview spielt synced Video, mutet VO-Track für diese Szene]
[Export muxt synced Video direkt, ohne VO drüber]
```

## Out of Scope
- Sora 2 / Veo 3 Native-Audio (separater Plan)
- Mehrere Sprecher pro Szene (Sync.so kann nur 1 Gesicht/Audio-Spur)
- Echtzeit-Preview vor Lip-Sync (zu langsam)

## Files

**Neu:**
- `supabase/functions/compose-lipsync-scene/index.ts`

**Edit:**
- `supabase/functions/lip-sync-video/index.ts` — leichte Generalisierung (URL statt video_id Mode)
- `src/components/video-composer/SceneDialogStudio.tsx` — Toggle + Cost-Hint
- `src/components/video-composer/SceneCard.tsx` — Badge + Re-sync Button
- `src/components/video-composer/VideoComposerDashboard.tsx` — Auto-Trigger nach Clip-Done
- `src/components/video-composer/ComposerSequencePreview.tsx` — VO-Track muten bei synced Szenen
- `supabase/functions/compose-video-assemble/index.ts` — VO bei synced Szenen nicht mehr muxen

**DB Migration:**
- `composer_scenes`: `lip_sync_applied_at TIMESTAMPTZ`, `lip_sync_source_clip_url TEXT` (für Re-sync auf Original)

## Memory-Update nach Implementierung
Neuer Eintrag: `[Composer Lip-Sync Pipeline](mem://features/video-composer/lipsync-pipeline)` — Sync.so Post-Step, Auto-Trigger, Re-sync-Flow, VO-Mute bei synced Szenen.
