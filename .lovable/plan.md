## Diagnose

Du beschreibst: **Erster Satz von Charakter 1 = saubere Lippenbewegung, alle weiteren Sätze (auch von Charakter 1) = kaum sichtbar.** Das ist KEIN Audio-/Identity-Problem und auch kein Provider-Ausfall — es ist eine Eigenheit der aktuellen v3-Pipeline.

**Was v3 macht (poll-dialog-shots):**
- Ein Sync.so-Pass **pro Sprecher**, in dem ALLE Turns dieses Sprechers als `segments_secs: [[w1],[w2],[w3]]` mitgegeben werden.
- Pass 1 (Sprecher A) → Pass 2 (Sprecher B) **chained** auf Pass-1-Output.

**Warum nur der erste Satz stark animiert wird:**
1. `sync/lipsync-2-pro` mit Multi-Window-`segments_secs` gewichtet seine VAD-/Phonem-Energie überproportional auf das **erste/längste** Fenster im selben Pass. Spätere Fenster im gleichen Pass bekommen deutlich schwächere Mundamplitude — ein bekanntes Verhalten, wenn man mehrere disjunkte Fenster in einen Pass packt.
2. Die `temperature` wird einmal pro Pass gewählt (1.0 bei min-Turn<2s, sonst 0.9). Bei gemischten Längen ist das ein Kompromiss, der für die kurzen Folge-Fenster nicht reicht.
3. Pass 2 läuft auf Pass-1-Output → das einzige Fenster, das Charakter A's "guten" ersten Satz noch zeigt, ist sein erstes; Folge-Fenster waren schon im Pass-1-Output schwach und werden von Pass 2 nur durchgereicht (cut_off außerhalb seiner Fenster).

Das v2-Modell (per Turn ein eigener Pass, chained) hatte das umgekehrte Problem: jeder Turn stark animiert, aber kumulative Re-Encodes machten das Bild weich. **Wir wollen beides: starke Animation pro Turn UND nur eine einzige Re-Encode-Generation.**

## Plan — v4: Per-Turn-Parallel + ffmpeg-Stitch

### Architektur

```text
master plate (pristine MP4)
        │
        ├── Sync.so Pass T0  (window=[t0_start,t0_end], coords=speakerA)  ──► out_T0.mp4
        ├── Sync.so Pass T1  (window=[t1_start,t1_end], coords=speakerB)  ──► out_T1.mp4
        ├── Sync.so Pass T2  (window=[t2_start,t2_end], coords=speakerA)  ──► out_T2.mp4
        └── ... (alle Turns parallel, jeder auf der ORIGINALEN Plate)
                            │
                            ▼
              ffmpeg concat by time-slice:
              [0..t0.end] from out_T0  +  [t0.end..t1.end] from out_T1  + ...
              → 1 Re-Encode-Generation everywhere, jede Mundbewegung volle Sync.so-Aufmerksamkeit
                            │
                            ▼
                     remux mit master WAV → final clip_url
```

### Konkrete Änderungen

1. **`compose-dialog-scene/index.ts` → `version: 4`**
   - `DialogShot` repräsentiert wieder **einen einzelnen Turn** (nicht einen Sprecher-Bündel):
     - `idx`, `speaker_idx`, `speaker_name`, `character_id`
     - `window: [start, end]` (genau ein Fenster pro Shot)
     - `target_coords` (Pixel-Center des Sprechers)
     - `temperature` (pro Turn: 1.0 wenn dur<2.0s, sonst 0.9 — KEIN Pass-Kompromiss mehr)
     - `status`, `sync_job_id`, `output_url`, `started_at`, `completed_at`, `error`
   - Credits: `9 cr/s × ceil(turnDur)` pro Turn aufaddiert.

2. **`poll-dialog-shots/index.ts` — Parallel-Dispatch**
   - **Pro Tick:** alle `pending`-Shots gleichzeitig dispatchen (kein "nur einer in-flight"-Gate mehr). Sync.so Creator-Plan erlaubt parallele Jobs, und es gibt keine Abhängigkeit mehr zwischen Turns.
   - Pro Shot: `startSyncSpeakerJob(masterPlateUrl, masterWavUrl, [shot.window], shot.coords, shot.temperature)` — `videoUrl` ist IMMER `state.source_clip_url` (pristine master), niemals ein vorheriger Output.
   - Pre-Roll/Tail (`expandWindows`) bleibt, clamped gegen alle anderen Turn-Boundaries.
   - Polling pro Shot wie bisher.

3. **Neue ffmpeg-Stitch-Phase (in `poll-dialog-shots`, wenn `allReady`)**
   - Baue eine zeitsortierte Segment-Liste, die Lücken (Stille zwischen Turns) der pristinen Master-Plate zuordnet und Turn-Fenster dem jeweiligen `out_T{i}.mp4`.
   - `ffmpeg` mit `concat demuxer` + `-c:v libx264 -preset veryfast -crf 18` zur Stitch-Datei, danach **`-c:v copy -c:a aac`** Remux mit `state.master_audio_url`.
   - Upload als `final_url` → `clip_url`, `lip_sync_status='done'`, `twoshot_stage='done'`.
   - Falls ffmpeg im Edge-Function-Runtime nicht verfügbar/zuverlässig ist (zu prüfen): Fallback auf eine kleine `stitch-dialog-shots` Edge-Function mit Deno-FFmpeg-WASM oder Aufruf eines bereits vorhandenen Stitch-Helpers (gibt es im Composer-Pfad — kurz checken in `_shared/`).

4. **DB-Reset der aktuellen Szene** (`60562d55-…` bzw. die zuletzt fehlgeschlagene)
   - `dialog_shots = NULL`, `twoshot_stage = 'master_clip'`, `lip_sync_status = 'pending'`, `clip_url` zurück auf `lip_sync_source_clip_url` (oder die pristine Master-Plate-URL aus `audio_plan.twoshot.source_clip_url`).
   - Damit re-triggert sich `compose-dialog-scene` v4.

5. **Deploy & Validierung**
   - Deploy: `compose-dialog-scene`, `poll-dialog-shots` (+ optional `stitch-dialog-shots`).
   - Logging pro Shot: `dispatched turn {idx} speaker={name} window=[a,b] coords=… temp=…`.
   - Erwartung: alle Turns READY in ~1–2 Polling-Zyklen (parallel statt seriell), Stitch in <30s, finaler Clip zeigt **gleich starke Mundbewegung** auf jedem Satz.

### Was bleibt unverändert

- Anchor-Sanitizer und Face-Audit (`compose-video-clips` / `compose-scene-anchor`) — die Stage davor.
- Audio-Pipeline (`compose-twoshot-audio`, Sample-akkurate WAVs, voicedRange.turns) — unverändert.
- Refund-Logik (idempotent pro Scene-State).
- Sync.so-Coords aus FaceMap (Identity-Match via Gemini), `auto_detect: false`.

### Erwartetes Ergebnis

- Jeder einzelne Turn wird mit voller Sync.so-Aufmerksamkeit + optimaler Temperature animiert → **alle Sätze gleich filmreif**.
- Nur **eine** Re-Encode-Generation pro Pixel im finalen Clip → keine Weichzeichnung mehr.
- Pipeline ist schneller (parallel statt seriell) und fehlertoleranter (Fail eines einzelnen Turns blockiert nicht die anderen).
