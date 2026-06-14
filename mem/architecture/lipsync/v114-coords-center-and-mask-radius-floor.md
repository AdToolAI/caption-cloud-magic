---
name: Lipsync v114 — Coords-Center ASD + Mask-Radius Floor + Stale-Preclip Re-Render
description: v114 ersetzt sync-3 auto_detect auf dem Preclip durch deterministische center-coords ASD, floored die FaceMask-Radius bei 0.28*minAxis (verhindert "Mund hinter Maske"), und re-rendert abgelaufene Preclip-URLs auf Retry.
type: feature
---

## Symptom
Sync.so jobs liefern `COMPLETED` + valide `outputUrl`, aber im finalen Composite bewegt sich kein einziger Mund. v112/v113 (720p Preclip + Speaking-Naturally Hint + No-op Guard) waren notwendige Vorarbeit, aber nicht ausreichend.

## Root Causes (aus deep Sync.so-Doc-Audit + Pipeline-Audit)

1. **Auto-Detect failt auf statischen Tight-Crops.** Sync.so Support-KB ("Why is my lip-sync not working / no mouth movement?") empfiehlt für single-face Tight-Crops **manuelle `coordinates`** statt `auto_detect:true`. Hailuo "speaking naturally" Plates haben am Midpoint-Frame oft geschlossenen Mund → Auto-Detect findet kein Audio-Motion-Correlation-Signal → silent pass.

2. **FaceMask-Radius war zu klein bei 3-4 Sprechern.** `0.15..0.18 * minAxis` ergab auf 720px-Plates nur 108–158px-Masken; der radiale Gradient endete bei ~73–107px (inner 68%) — Mundpartie lag hinter der Maskenkante. Sync.so animierte korrekt, aber das Composite hat es überdeckt.

3. **Stale Preclip-URL auf Retry.** Supabase signed URLs laufen nach 24h ab; auf Retry-Pfad wurde die gecachte `preclip_url` ohne Probe wiederverwendet → Sync.so `generation_input_video_download_error` → pass stirbt silent.

## Implementation

### `compose-dialog-segments/index.ts` (preclip ASD)
```ts
const outSize = (pass.preclip_crop?.outputSize ?? pass.preclip_crop?.size ?? 720);
const center = Math.floor(outSize / 2);
syncOptions.active_speaker_detection = {
  auto_detect: false,
  frame_number: 0,
  coordinates: [center, center],
};
```
Doc-strict für sync-3 (nur `sync_mode` + `active_speaker_detection`, keine temperature/occlusion).

### `compose-dialog-segments/index.ts` (stale-URL guard)
Auf `isRetry=true`: HEAD-probe `pass.preclip_url`. Bei ≥400 oder Fetch-Fail → `preclip_url/render_id/crop = null` → Re-Render erzwingen.

### `render-sync-segments-audio-mux/index.ts` (mask radius)
```ts
const radiusForCount = minAxis * 0.28; // floor, independent of speaker count
```

## Affected scenes (reset on deploy)
- `e57ef6dd-31a4-4b9d-9b49-5894d64bea7d`
- `3da688ef-e467-45e7-a6a7-503c1432270a`

`lip_sync_status='pending'`, `dialog_shots=NULL`, `twoshot_stage=NULL`; `scene_anchor_cache` für beide Szenen gelöscht.

## References
- Sync.so Support KB: https://support.sync.so/articles/8516239397
- Sync.so Speaker Selection: https://sync.so/docs/developer-guides/speaker-selection
- Sync.so Media Content Tips: https://sync.so/docs/compatibility-and-tips/media-content-tips
