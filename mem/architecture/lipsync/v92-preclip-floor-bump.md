---
name: v92 — Preclip Crop Floor Bump (Last-Speaker Static Lips Fix)
description: face-crop floor 160→220 px (and neighbor cap 0.9→0.88) so 4-speaker preclips give Sync.so auto_detect enough facial pixels; fixes silently un-animated last speaker (DB-confirmed YAVG diff 1.1 vs 17 for centered speakers)
type: architecture
---

# v92 (Juni 2026)

## Symptom
4-Sprecher Composer-Szene `63fc42c2…`: alle 4 Pässe `status=done`, jeder hat `output_url`, kein Fehler in Sync.so-Webhook-Logs. **Aber:** im finalen Mux animierte nur Speaker 1–3, Sarah (Speaker 4, x=113 in 768er Plate) hatte praktisch geschlossenen Mund während ihres Voice-Windows.

## Diagnose
Frame-Differenz (ffmpeg `blend=difference,signalstats`) Preclip vs. Sync.so-Output:
- Samuel (zentriert, xFrac=0.60): YAVG ≈ **17** (starke Lippenbewegung)
- Sarah (Edge, xFrac=0.15): YAVG ≈ **1.1** (Sync.so lieferte fast unverändertes Preclip zurück)

Tight-WAV von Sarah war sauber (−18 dB RMS), `audio_tight.dur_sec=1.818s`, `preclip_crop.size=160`. Sync.so hat den Job mit `lip_sync_status=success` quittiert, aber die `auto_detect`-Heuristik auf dem 160→512 hochskalierten Crop fand offenbar nicht genug Detailkontrast für eine konfidente Mund-Animation.

Alle 4 Pässe hatten `crop.size=160` — den **alten Boden** von `Math.max(160, 0.9 × neighborDist)` aus v76. Bei 4 nebeneinander stehenden Sprechern liegt der Neighbor-Abstand bei ≈ 170 px, also genau am Boden festgenagelt. Sync.so bekam für ALLE 4 Sprecher denselben mageren Crop — bei zentrierten Speakern reichte das, bei den Edge-Speakern (xFrac < 0.25) nicht.

## Fix
`supabase/functions/_shared/face-crop.ts`:
```diff
- const maxAllowed = Math.max(160, 0.9 * minNeighborDist);
+ const maxAllowed = Math.max(220, 0.88 * minNeighborDist);
```
- Boden **160 → 220 px** (+38 % Pixel, +20 % linearer Detailgewinn nach dem 3.2× → 2.3× Upscale auf 512²)
- Neighbor-Faktor **0.9 → 0.88** kompensiert den höheren Floor; bei typischem 170 px Gap rutscht der Cap auf 0.88 × 170 = 149.6 → Boden 220 greift; bei 280 px Gap (3-Speaker) → 0.88 × 280 = 246 → Cap 246, beide Speaker bekommen mehr Kontext.
- Single-Speaker / wide-gap (`!hasNeighbors`): zusätzlich `size = Math.max(size, 220)`.

## Sicherheitsmarge
Für Sarah ([113, 426]) nearest neighbor Matthew ([285, 418]), Distanz 172 px. Neuer Crop 220 px zentriert → Edge x=223. Matthew's Gesicht beginnt ~x=235 (Halbbreite ≈ 50). 12 px Buffer bleibt — Neighbor-Bleed-Garantie hält.

## Out of Scope (für später, wenn das nicht reicht)
- Post-Render Amplitude-Check (ffmpeg frame-diff) mit auto-Retry auf `coords-pro-lp2pro` bei YAVG < threshold.
- Edge-Speaker spezifischer Boden (z. B. 260 px für xFrac < 0.2 oder > 0.8).
- v88 Full-Plate-Fallback verfügbar machen wenn `plateIdentityMap.resolvedCount === 0` (was hier der Grund war, dass Edge-Speaker überhaupt im Preclip-Pfad landeten).

## Bundle
Keine Lambda-Bundle-Änderung nötig. Reines Edge-Function-Deploy von `compose-dialog-segments`.

## Manueller Verifikations-Step
Im Composer auf der betroffenen Szene "Lip-Sync neu anstoßen" klicken — der Refund/Re-Render zieht die neuen Crop-Größen sofort und Sarah's Pass 4 sollte mit sichtbarer Mundbewegung zurückkommen.
