## Aktueller Stand (Diagnose)

Die Two-Shot-Szene `b4237058…` steht in der DB jetzt so:
- `engine_override = cinematic-sync`, `clip_url = silent video` ✅
- `lip_sync_status = NULL`, `lip_sync_applied_at = NULL`, `character_audio_url = NULL`, `audio_plan = NULL` ❌
- `dialog_script` + `dialog_voices` + 2 `character_shots` sind noch da ✅
- **Keine** `scene_audio_clips` (kind=voiceover) für die Szene

Was der Nutzer hört: Das **globale Projekt-Voiceover** (`assemblyConfig.voiceover.audioUrl`), das in `ComposerSequencePreview` als Fallback über die Szene gelegt wird, weil die Szene selbst keinen Two-Shot-Audio-Track hat.

**Root-Cause:** Unser Reset hat den Two-Shot-State gelöscht, aber die Pipeline (`compose-twoshot-audio` → `compose-twoshot-lipsync`) nicht neu angestoßen. Der Auto-Trigger in `ClipsTab.tsx` (Zeile 280–335) fordert genau diesen Zustand (`engine_override='cinematic-sync'` + `clip_url` + `lip_sync_status=NULL` + `!lip_sync_applied_at`) — er feuert aber nur, wenn der Nutzer den Composer im Browser auf `ClipsTab` geöffnet hat. Der Nutzer hängt aber im **Voiceover-Tab** (Step 04 im Screenshot) — darum läuft kein Auto-Trigger.

## Plan

### 1. One-Shot Re-Trigger jetzt für die betroffene Szene
Direkt `compose-twoshot-lipsync` invoken (der hat den Fallback eingebaut, der `compose-twoshot-audio` selbst aufruft, falls der Merged-VO fehlt). Vorher `lip_sync_status='running'` setzen, damit kein Doppel-Trigger entsteht. Logs prüfen, bis `lip_sync_applied_at` und `character_audio_url` gesetzt sind.

### 2. Auto-Trigger Tab-unabhängig machen
Den State-Detektor aus `ClipsTab.tsx` (Zeilen 276–335) in einen Hook `useTwoShotAutoTrigger(projectId)` ziehen und in `VideoComposerDashboard.tsx` mounten — dort lebt er für alle Tabs (Briefing, Storyboard, Clips, Voiceover, Musik, Export). Verhalten: identisch zur aktuellen Logik, aber zusätzlich greift er auch wenn der User nie den Clips-Tab öffnet. So bleibt nichts hängen, wenn z.B. nach einem Reset oder Edit die Szene wieder „pending" wird.

### 3. Playback-Schutz in `ComposerSequencePreview`
Wenn eine Szene Two-Shot-Konfig hat (`character_shots.length >= 2 && lip_sync_with_voiceover && dialog_script`) **aber noch kein `lip_sync_applied_at`**, dann:
- Globales `voiceoverUrl` für diese Szene **muten** (statt fallthrough), damit der User nicht ein „falsches" VO hört, das als Lip-Sync wirken soll.
- Statusbadge oben rechts in der Szenen-Vorschau: „Lip-Sync wird vorbereitet…" statt stiller Lüge.
Das entkoppelt visuelles Erlebnis vom Pipeline-Status — kein „Charaktere stehen stumm da, aber Stimme läuft" mehr.

### 4. Sichtbares Re-Trigger-CTA im Voiceover-Tab
In der Voiceover-Stage (Step 04) eine Karte „Two-Shot Lip-Sync erneut ausführen" mit einem Button, der `compose-twoshot-lipsync` für die markierte Szene aufruft. Notfall-Knopf für Cases, in denen der Auto-Trigger nicht durchläuft (z.B. nach DB-Resets, nach manueller Voice-Änderung).

### 5. Verifikation
Nach Deploy:
1. `compose-twoshot-lipsync` für `b4237058…` invoken
2. Logs prüfen (audio prep OK, Sync.so passes OK)
3. DB checken: `lip_sync_applied_at` ≠ NULL, `character_audio_url` ≠ NULL, `audio_plan.twoshot.useExternalAudio = true`
4. Im Composer Vorschau abspielen → Charaktere reden synchron, kein Doppel-VO

## Technische Details (für später)

**Geänderte Dateien:**
- `src/components/video-composer/VideoComposerDashboard.tsx` — neuer Hook-Aufruf
- `src/hooks/useTwoShotAutoTrigger.ts` (neu) — Auto-Trigger-Logik aus ClipsTab extrahiert
- `src/components/video-composer/ClipsTab.tsx` — alte Trigger-Logik entfernen (jetzt im Hook)
- `src/components/video-composer/ComposerSequencePreview.tsx` — `pendingTwoShotSceneIds` Set, globalen VO darüber muten
- `src/components/video-composer/SceneVoiceoverStudio.tsx` (oder analog Voiceover-Tab) — neuer Re-Trigger-Button

**Out of Scope:** Pipeline-interna (compose-twoshot-audio/lipsync) bleiben unverändert — die funktionieren laut Code korrekt, sie werden nur nicht angestoßen.
