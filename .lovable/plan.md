
## Befund (eindeutig durch DB-Inspektion bestätigt)

Szene `c7091d3d-…` aus dem Composer-Projekt `b03aef88-…`:

- `dialog_shots.engine = "sync-segments"`, `version = 5`, **multi_pass = true**, 2 Passes (Pass 0 = Samuel, Pass 1 = Matthew).
- Pass 0 Input: Master-Plate + char0-WAV (nur Samuel). Output: Full-Length-MP4, in dem **Sync.so die komplette Audiospur durch die Pass-Input-Audio ersetzt** → enthält nur Samuels Stimme.
- Pass 1 Input: Pass-0-Output als Video + char1-WAV (nur Matthew). Output: gleiche Mechanik → Audiospur ist jetzt nur noch Matthew.
- `sync-so-webhook` (Z. 315–388) lädt nach dem letzten Pass exakt diese Datei in `ai-videos/composer/.../c7091d3d-…-lipsync.mp4` und setzt `clip_url = finalUrl`.
- Ergebnis: gerendertes Composer-MP4 enthält **nur die Stimme des zweiten Charakters** — exakt wie der User beschreibt.

Der gemergte Master-Mix mit beiden Stimmen liegt fertig in `audio_plan.twoshot.url` (`…-1780100336908.wav`) — er wird beim Finalize aktuell ignoriert.

## Fix (zwei minimale Änderungen, beide nur Backend, kein ffmpeg im Edge-Runtime)

Idee: nach dem letzten Sync.so-Pass die Audiospur durch den bereits existierenden Master-Merged-WAV ersetzen. Da Supabase-Edge-Runtime kein ffmpeg darf, muss der Mux auf Lambda passieren. Die vorhandene `DialogStitchVideo`-Komposition leistet das von Haus aus: sie spielt `masterVideoUrl` muted ab und legt `masterAudioUrl` als einzige Audiospur darüber. Mit leerem `shots`-Array degeneriert sie zu einem reinen Audio-Swap — kein neues Remotion-Bundle nötig.

### 1) Neue Edge Function `render-sync-segments-audio-mux`

Modelliert nach `render-dialog-stitch`. Input `{ sceneId }`. Schritte:

- Liest `composer_scenes.dialog_shots` (muss `engine='sync-segments'`, `status='done'`, `final_url` gesetzt sein).
- Liest `audio_plan.twoshot.url` (Master-Merged-WAV) und `audio_plan.twoshot.totalSec`.
- Erstellt eine `video_renders`-Zeile mit `source = 'sync-segments-audio-mux'`, customData enthält `composer_scene_id`, `pending_render_id`, `final_lipsync_url` (für Idempotenz/Webhook-Pfad).
- Dispatcht Lambda mit `composition = "DialogStitchVideo"` und Input
  ```ts
  {
    masterVideoUrl: dialog_shots.final_url, // Sync.so-Output (Lipsync drin, falsche Audio)
    masterAudioUrl: audio_plan.twoshot.url, // gemergter Master-WAV mit beiden Stimmen
    totalSec,
    targetWidth, targetHeight,
    shots: []                                // kein Overlay nötig — Lipsync ist bereits im Video
  }
  ```
- `muted: false`, `audioCodec: "aac"`, `width/height/fps/durationInFrames` wie bei `render-dialog-stitch`.
- Persistiert `dialog_shots.audio_mux = { render_id, dispatched_at }` für Idempotenz (kein Doppel-Dispatch bei Webhook-Replay).

### 2) Anpassung in `supabase/functions/sync-so-webhook/index.ts` (Z. 315–388)

Im v5/sync-segments „Last Pass complete"-Branch:

- Re-host wie bisher (Sync.so-URL ist nach 24h tot → wir müssen sie behalten).
- Aber **nicht** sofort `clip_url = finalUrl` und `lip_sync_applied_at` setzen, wenn `passes.length >= 2` (echter Multi-Speaker-Fall). Stattdessen:
  - `dialog_shots = { …, passes, status: 'audio_muxing', final_url: finalUrl, sync_so_url: outputUrl, finished_at: nowIso }`
  - `lip_sync_status = 'audio_muxing'`, `twoshot_stage = 'audio_muxing'` (lass `clip_url` noch leer/alt).
  - Fire-and-forget POST an `render-sync-segments-audio-mux` mit `{ sceneId }`.
- Single-Speaker-Pfad (`passes.length === 1`) bleibt unverändert: dort ist die einzige Pass-Audio identisch mit dem Master-WAV → kein Audio-Swap nötig, `clip_url` direkt setzen.
- `remotion-webhook` schreibt nach erfolgreichem Audio-Mux-Render `clip_url = muxed_url`, `lip_sync_applied_at = now()`, `lip_sync_status = 'applied'`, `dialog_shots.status = 'done'`. Für die neue `source='sync-segments-audio-mux'`-Branch muss in `remotion-webhook` analog zum bestehenden `dialog-stitch`-Pfad ein kleiner Handler ergänzt werden, der auf den `composer_scene_id`-Customdata zugreift.

### 3) Refund-/Fehler-Pfad

Wenn der Audio-Mux-Render fehlschlägt: `dialog_shots.audio_mux_error` setzen, `lip_sync_status = 'failed'`, **keinen** Sync.so-Refund (die Lipsync-Generierung war erfolgreich), aber den Mux-Render normal über die bestehende `video_renders`-Fehlerbehandlung markieren. Optional: Fallback-Knopf im UI „Audio neu muxen", der `render-sync-segments-audio-mux` erneut dispatcht.

## Warum nicht woanders fixen?

- **Sync.so so verwenden, dass es die Audio NICHT überschreibt:** Sync.so v2 ersetzt zwangsläufig die Audiospur durch die übergebene Audio. Wir müssten pro Pass den vollen Merged-WAV mitschicken, dann animiert Sync.so aber auch das fremde Sprechergesicht (Auto-Face-Detection by loudest voice) → genau der Bug, den die per-Speaker-Tracks im v8-Staleness-Guard verhindern sollen.
- **Single-Pass mit allen Segments_secs:** funktioniert nur für einen Sprecher pro Job — Sync.so v2 macht ein Face-Target pro Job. Multi-Speaker erzwingt mehrere Passes.
- **In `compose-video-assemble` retten:** Der Composer-Final-Render zieht `clip_url` als Master-MP4 und respektiert dessen Audio (nach unserem letzten Fix). Wenn `clip_url` schon nur eine Stimme enthält, ist es zu spät — der Fix muss vor `clip_url=...` greifen.

## Out of Scope

- Keine Änderung an `ComposedAdVideo.tsx`, `DialogStitchVideo.tsx` (wird wiederverwendet mit `shots=[]`), Composer-Frontend, Two-Shot-Legacy-Pfad (v4), Sync.so-Pricing, Refund-Logik für Lipsync selbst.
- Single-Speaker-Sync-Segments-Szenen bleiben unverändert (kein zusätzlicher Lambda-Roundtrip).

## Validation

- Re-Render der Szene `c7091d3d-…`: nach Webhook-Pass-1-Complete steht `lip_sync_status='audio_muxing'`, danach `clip_url` zeigt auf `…-lipsync-muxed.mp4` und enthält **beide Stimmen** plus den bereits gebackten Lipsync für beide Gesichter.
- Edge-Log: `[sync-so-webhook] v5 scene=… last pass done → dispatching audio mux` und anschließend `[render-sync-segments-audio-mux] dispatched render=…`.
- Composer-Final-Render (mit dem letzten `hasAudio`-Fix) übernimmt die korrekte Stereomischung in das fertige Ad-MP4.

## Geänderte Dateien

- **Neu:** `supabase/functions/render-sync-segments-audio-mux/index.ts`
- **Edit:** `supabase/functions/sync-so-webhook/index.ts` (Last-Pass-Branch, nur Multi-Speaker-Fall)
- **Edit:** `supabase/functions/remotion-webhook/index.ts` (kleiner Handler für `source='sync-segments-audio-mux'`)
- **Memory-Update:** Eintrag in `mem/architecture/lipsync/` über den Audio-Mux-Schritt.
