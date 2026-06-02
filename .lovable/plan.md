# 3+ Speaker Lip-Sync: Root-Cause-Fix via Per-Speaker + Mask Composite

## Das eigentliche Problem (Root Cause)

Der aktuelle 3+ Sprecher-Flow ist ein **Multi-Pass-Chain**:

```text
Plate ──► Sync.so(Speaker A) ──► Output_A ──► Sync.so(Speaker B) ──► Output_B ──► Sync.so(Speaker C) ──► Final
```

Jeder Pass nimmt das **diffusionsgenerierte Output des vorherigen Passes** als Input. Das ist der Grund warum:
- Pass 1 (Original-Plate) immer funktioniert
- Pass 2/3 mit "unknown error" failen – unabhängig von Koordinaten, Frames, Plate-Dims
- Sync.so `lipsync-2-pro` ist ein Diffusionsmodell und reagiert instabil auf re-encoded Output seiner selbst (Kompressions-Artefakte, Farbshifts, leichte temporale Inkonsistenzen)
- Die letzten Fixes (Dims-Probe, Coord-Clamp, Frame-Retries) sind alle Symptom-Patches

**Wie Artlist / professionelle Tools das lösen:** Sie chainen nie. Jeder Speaker wird auf der **Original-Plate** generiert, dann werden die Mund-/Gesichtsregionen maskiert und auf die Plate komponiert. Sync.so sieht nie sein eigenes Output.

## Lösung: Per-Speaker Parallel + Mask-Composite

### Architektur

```text
                    ┌─► Sync.so(Speaker A on plate, only A audio) ──► Out_A
Original Plate ─────┼─► Sync.so(Speaker B on plate, only B audio) ──► Out_B
                    └─► Sync.so(Speaker C on plate, only C audio) ──► Out_C
                                          │
                                          ▼
                         ffmpeg Mask-Composite per Speaker-Region
                                          │
                                          ▼
                                  Final 3-Speaker Clip
```

Jeder Sync.so-Job ist exakt so stabil wie ein 1-Speaker-Job (was nachweislich >99% funktioniert).

### Pro Speaker N
1. **Audio-Track bauen:** Originale Dialog-Audio, aber alle anderen Sprecher-Turns werden mit `volume=0` (Silence) ersetzt. Speaker N hört man, Rest = Stille.
2. **Sync.so Call:** Input = **Original-Plate** (immer dieselbe), Audio = Speaker-N-only Track, `targetCoords` = Speaker-N Gesicht.
3. Sync.so animiert nur Speaker N (die anderen bleiben statisch, weil deren Audio Silence ist – das ist genau wie Sync.so designt wurde).

### Composite-Stage
Nach N parallelen Sync.so-Jobs haben wir N Videos, jedes mit nur einem animierten Mund. ffmpeg-Composite:
1. Aus jedem `Out_N` wird ein **Crop-Rechteck um Speaker-N Gesicht** extrahiert (basierend auf bekannten `targetCoords` + Face-Bbox).
2. Soft-edge Maske (feathered alpha, 20-30px) verhindert harte Kanten.
3. Overlay aller N Crops auf die Original-Plate.
4. Original-Audio (alle Speaker zusammen) wird zurückgemuxt.

ffmpeg-Filter (vereinfacht):
```text
[plate][crop_A]overlay=x=...:y=...:enable='alpha_mask_A'[v1];
[v1][crop_B]overlay=...[v2];
[v2][crop_C]overlay=...[vout]
```

## Implementierungs-Schritte

### 1. Neue Edge Function: `compose-dialog-parallel`
- Triggert für `speakers.length >= 3` (1/2 Sprecher unverändert via existierende Pipeline)
- Erstellt N parallele `dialog_shots` Rows mit:
  - `input_video_url` = Original-Plate (bei allen gleich)
  - `audio_url` = Speaker-N-isolated Track (neu generiert via ffmpeg)
  - `target_coords` = Speaker-N Koordinaten
  - `composite_role` = `parallel_speaker_N`
- Alle N Jobs werden gleichzeitig an Sync.so übergeben

### 2. Audio-Isolation Helper (`_shared/dialog-audio-isolation.ts`)
- Input: Dialog-Audio + Turn-Timings + Speaker-Map
- Output: N Audio-URLs, jeweils mit nur Speaker-N hörbar, Rest Silence
- ffmpeg via Deno subprocess oder Cloud-ffmpeg edge function

### 3. Composite Edge Function: `composite-dialog-masks`
- Trigger: alle N `dialog_shots` mit gleicher `scene_id` sind `ready`
- Lädt alle N Sync.so-Outputs + Original-Plate + Original-Mixed-Audio
- ffmpeg-Composite mit Soft-Edge-Masken pro Speaker-Region
- Output: finaler Multi-Speaker Clip → `scene.clip_url`

### 4. Polling-Anpassung: `poll-dialog-shots`
- Erkennt `composite_role = parallel_speaker_N`
- Statt sequenzieller Chain → wartet auf alle N parallel, dann triggert `composite-dialog-masks`
- Refund-Logik unverändert (idempotent per shot)

### 5. Sicherer Rollout
- Feature-Flag `dialog_parallel_composite_enabled` (default `true` für 3+ Sprecher)
- Fallback: Wenn Composite-Stage fehlschlägt → bestehende Chain als Backup (eine Generation lang)
- Monitoring: Erfolgsrate per Engine im QA Cockpit

### 6. Recovery
- Migration: Aktuell stuck Scene `c59e6d09-07a9-4764-ab2d-5a679790cbf8` resetten

### 7. Memory Update
- `mem://architecture/lipsync/sync-so-webhook-stage5` mit neuer Architektur dokumentieren

## Was sich NICHT ändert
- **1-Speaker Pipeline:** unangetastet (single Sync.so call)
- **2-Speaker Pipeline:** unangetastet (existierende 2-shot-lipsync chain mit zwei Passes – funktioniert)
- Aktivierung nur für `speakers.length >= 3`

## Erwartete Erfolgsquote
- Per-Speaker Job ≈ 1-Speaker-Stabilität (>99%)
- Bei 3 Speakern: 0.99³ ≈ 97% End-to-End (vs. aktuell ~30-50% durch Chain-Degradation)
- Refund-Granularität: failt nur Pass N, andere bleiben verwertbar für Retry

## Offene Fragen
1. **ffmpeg in Edge Functions:** Wir nutzen ffmpeg bereits in `compose-dialog-segments` für Concat. Composite mit Masken ist komplexer aber machbar. Alternative: Replicate ffmpeg-Worker (langsamer, aber stabiler).
2. **Face-Bbox-Größe für Crop:** Aktuell haben wir nur Center-Coords. Wir brauchen Bbox (W×H). Lösung: Bei Plate-Komposition (`compose-scene-anchor`) bereits Bbox mit-speichern, fallback: feste 25%-Bildbreite-Quadrat um Center.
3. **Sync.so Verhalten bei Silence-Tracks:** Verifizierung nötig dass Sync.so bei stillem Speaker-Audio diesen Speaker statisch lässt (sollte so sein – kein Phoneme, kein Movement). Schneller Test mit 1 Mock-Job vor Full-Rollout.

## Files (nur 3+ Sprecher Pfad)
- NEU: `supabase/functions/compose-dialog-parallel/index.ts`
- NEU: `supabase/functions/composite-dialog-masks/index.ts`
- NEU: `supabase/functions/_shared/dialog-audio-isolation.ts`
- EDIT: `supabase/functions/poll-dialog-shots/index.ts` (parallel-mode branch)
- EDIT: `supabase/functions/compose-dialog-segments/index.ts` (Routing 3+ → parallel)
- NEU: Migration für `dialog_shots.composite_role` + `scene.composite_strategy` Spalte
- EDIT: `mem://architecture/lipsync/sync-so-webhook-stage5`
- Migration: Recovery der gestuckten Scene
