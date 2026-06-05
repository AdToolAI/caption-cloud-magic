# v50 Re-Render der zuletzt generierten Szene

## Identifizierte Szene

Letztes generiertes Dialog-Video (aus `composer_scenes` sortiert nach `updated_at`):

- **Scene-ID**: `57a28235-ccad-4400-8c75-fa168f18cc96`
- **Project-ID**: `28384dfb-c0f2-48df-aa6d-5f9353ab7402`
- **Letzter Render**: 2026-06-05 00:24 UTC (v49 — Speaker 3 Mund blieb zu)

Das ist exakt die Szene, über die du gerade sprichst — sie wurde zuletzt mit v49 (`lipsync-2` + auto-ASD) gerendert und hat das beschriebene Problem.

## Schritte

1. **Reset** Scene `57a28235-…` via Migration auf `clip_status = 'pending'`, `dialog_shots = []`, kein Refund nötig (idempotent über deterministische UUID, falls Sync.so noch was zurückmeldet).
2. **Auto-Trigger** (`useTwoShotAutoTrigger`, 8s-Tick) nimmt die Szene automatisch auf und dispatcht v50:
   - `model: lipsync-2-pro`
   - `segments[]` mit per-Segment `optionsOverride.active_speaker_detection.bounding_boxes`
   - Boxen aus `frame_face_cache` (Stage G) rescaled auf Plate-Space, Speaker→Box-Mapping über `characterId`/`slotIndex`/Left-to-Right-Fallback
   - Speaker ohne erkannte Box → Auto-ASD-Fallback nur für dieses eine Segment
3. **Monitoring**: Edge-Function-Logs `compose-dialog-segments` + `sync-so-webhook` mitlesen; Log-Marker `v50_official_segments_payload model=lipsync-2-pro asd=bounding_boxes_per_segment` muss erscheinen.
4. **Visual-Check**: Sobald `clip_status = 'ready'` → Preview ansehen, ob Speaker 3 jetzt korrekt lippt und Qualität sichtbar besser ist.

## Erwartung

- **Speaker 3 spricht** → deterministisches Bounding-Box-Targeting löst das Auto-ASD-Problem.
- **Schärfere Mundregion** → `lipsync-2-pro` statt `lipsync-2`.
- **Kein 15-min-Timeout** mehr → v50 ist ein einziger Sync.so-Call (keine Fan-Out-Retries), Watchdog greift bei 8min.

## Fallback

Falls v50 fehlschlägt oder Speaker 3 immer noch nicht erkannt wird:
- Logs prüfen: wieviele Boxen lieferte Stage G? (`v50_segments_with_box` vs `v50_segments_auto_fallback`)
- Wenn <3 Boxen erkannt → Plate-Face-Detect Schwelle senken, oder Single-Speaker-Cinematic-Sync pro Turn als Fallback empfehlen (memo'd in `v50-pro-bounding-boxes.md`).

Soll ich so durchziehen?
