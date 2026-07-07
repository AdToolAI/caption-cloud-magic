# v204 — Rollback zur v169-Preclip-Pipeline

## Warum

Der v203-Full-Plate-Zwang produziert `generation_input_face_selection_invalid` bei Sync.so. Historische Memory (v68, v107, v126, v163) und der v169-Guide belegen: Multi-Face-Plates werden von Sync.so systematisch abgelehnt. Der stabile Pfad ist **Single-Face-Preclip pro Pass**.

## Zielarchitektur (nach Rollback)

Pro Dialog-Pass (1 Speaker pro Pass, egal wie viele Speaker in der Szene):

```text
Master-Plate ──► Preclip-Renderer ──► Single-Face-Crop-MP4
                       │                       │
                       ▼                       ▼
              exakte frame_count         Sync.so Payload:
              + Mund-BBox in             - video_url = preclip_url
              Clip-Koordinaten          - bounding_boxes_url (Clip-Space)
                                        - sync_mode = "cut_off"
                                        - model = sync-3
                                        - KEIN auto_detect für N≥2
                       │
                       ▼
              Sync.so Output (Crop) ──► Audio-Mux zurück auf Master-Plate
```

## Änderungen

### 1. `supabase/functions/compose-dialog-segments/index.ts`

Alle v203-Guards entfernen bzw. invertieren:

- **`v161PreclipEligible`**: für `speakers.length >= 2` wieder `true` setzen (v203 hatte auf `false` gezwungen).
- **Preclip-Cache-Reuse**: `preclip_url` / `preclip_crop` / `frame_count` aus Cache wieder verwenden statt zu droppen.
- **v203-Fail-Closed-Block** entfernen: der `v203_preclip_forbidden` Hard-Fail (inkl. Refund-Trigger) wird ersatzlos gestrichen.
- **Dispatch-Payload für N≥2**:
  - `video_url` = `preclip_url` (nicht Master-Plate)
  - `asd_mode` = `"bounding_boxes_url"` mit BBox in **Clip-Space** (nicht Plate-Space)
  - `bounding_boxes_url` referenziert eine JSON mit `frame_count === preclip_frame_count` (Fail-Closed wenn ungleich)
  - `model` = `"sync-3"`, `sync_mode` = `"cut_off"`
  - `auto_detect` wird für N≥2 nie gesetzt
- **Legacy-Retry-Varianten** wieder erlauben: `coords-pro`, `sync3-coords`, `sync3-bbox-preclip` — aber nur wenn sie Preclip-basiert sind. `auto-detect`-Varianten für N≥2 bleiben blockiert (v169-Regel).
- **Telemetry-Marker** aktualisieren: `canonical_lipsync_pipeline = "v204_preclip_bbox_clipspace"`, `input_space = "clip"`, `preclip_used = true`.

### 2. `supabase/functions/sync-so-webhook/index.ts`

- **NOOP-Escalation für N≥2 wieder erlauben** (v203 hatte das blockiert), aber nur innerhalb der Preclip-basierten Retry-Ladder.
- Neue Marker (`v204_preclip_bbox_clipspace`) beim Persistieren des Ergebnisses.

### 3. Memory-Update

- `mem/architecture/lipsync/v200-id-only-cast-resolution.md`: v203-Sektion als "reverted" markieren, Verweis auf v204.
- Neue Datei `mem/architecture/lipsync/v204-preclip-bbox-clipspace-rollback.md`:
  - Regel: N≥2 = Preclip pro Pass + `bounding_boxes_url` in Clip-Space + `sync-3` + `cut_off`.
  - Fail-Closed wenn `bbox.frame_count !== preclip.frame_count`.
  - v203-Full-Plate-Weg ist **verboten** (dokumentierte Regression).
- `mem/index.md`: Core-Bullet aktualisieren.

### 4. Keine Änderungen an

- Face-Track-Preclip-Renderer selbst (funktioniert)
- ID-basierte Speaker-Resolution aus v201/v202 (bleibt korrekt)
- Anchor-Image-Invariant (v195)
- UI, Briefing, Composer, Lipsync-2/Pro-Fallbacks für N=1

## Verifikation nach Deploy

1. Health-Ping auf beide Edge Functions.
2. Query auf `syncso_dispatch_log` (letzte 24h nach Deploy): alle N≥2-Dispatches müssen `canonical_lipsync_pipeline='v204_preclip_bbox_clipspace'`, `input_space='clip'`, `preclip_used=true`, `model='sync-3'` haben.
3. Keine Dispatches mit `input_space='plate'` mehr für N≥2.
4. Nächster Multi-Speaker-Run muss ohne `generation_input_face_selection_invalid` durchlaufen.

## Rollback-Plan falls v204 fehlschlägt

Weiterer Fallback ist die v126/v163-Variante (Preclip + `auto_detect:true`). Das wäre ein isolierter Payload-Switch am Dispatch-Punkt, kein weiterer Rollback nötig.
