## Ziel

Für 3+ Sprecher-Szenen `active_speaker_detection` von `{ frame_number, coordinates: [x, y] }` auf `{ frame_number, bounding_boxes: [[x1, y1, x2, y2]] }` umstellen. Damit trifft Sync.so das Gesicht auch dann, wenn es im Zielframe leicht versetzt ist (Schulter-an-Schulter Two-/Three-Shots) — der Punkt-Hit-Test ist dort der häufigste Auslöser für "active speaker not found".

## v43 Payload-Änderung (nur 3+ Sprecher)

```text
segments[i].optionsOverride.active_speaker_detection = {
  frame_number: <int>,
  bounding_boxes: [[x1, y1, x2, y2]]   // statt coordinates: [x, y]
}
```

Alle anderen Felder bleiben unverändert (`model: lipsync-2-pro`, top-level `segments[]`, `audioInput.refId`, `sync_mode: "loop"`, Webhook).

## Wo die Box herkommt

Drei Quellen, in dieser Prio-Reihenfolge:

1. **`twoshot-face-map` Cache** — liefert pro Sprecher bereits `{ cx, cy, w, h }` aus der Plate-Analyse. Daraus
   ```
   x1 = clamp(cx - w/2 - pad, 0, W)
   y1 = clamp(cy - h/2 - pad, 0, H)
   x2 = clamp(cx + w/2 + pad, 0, W)
   y2 = clamp(cy + h/2 + pad, 0, H)
   ```
   mit `pad = 0.08 * max(w, h)` (~8% Margin gegen Mikro-Drift).

2. **`frame_face_cache` / `validate-frame-face`** (Stage D) — falls die Face-Map nur `(cx, cy)` ohne `w/h` hat, Box aus dem Face-Gate-Result nehmen (das prüft sowieso schon pro Sprecher einen Plate-Frame).

3. **Fallback Quadrat** — wenn weder Face-Map noch Face-Gate eine echte Box liefern: Quadrat um den bestehenden Punkt mit Kantenlänge `min(W, H) * 0.18`. Logging-Marker `v43_bbox_fallback_square` damit wir sehen, wie oft das passiert.

## Validierung vor Dispatch

In `compose-dialog-segments` direkt vor der Sync.so-POST:

- Box-Koordinaten sind Integer und liegen in `[0, W]` / `[0, H]`
- `x2 > x1`, `y2 > y1`, Min-Fläche ≥ `(W*H) * 0.005`
- Boxen verschiedener Sprecher dürfen sich überlappen (Two-Shot ist normal), aber nicht identisch sein → ansonsten Warn-Log `v43_bbox_speaker_collision` und 4px-Shift der zweiten Box, damit Sync.so eindeutig disambiguieren kann
- Fail-fast Refund + klare Fehlermeldung, wenn für irgendeinen Sprecher keine valide Box gebaut werden konnte (statt 13-min Sync.so-Run ins Leere)

## State & Webhook

- `composer_scenes.dialog_shots.version: 43`, `engine: "sync-official-segments"`, `model: "lipsync-2-pro"`, neues Feld `asd_mode: "bounding_boxes"`
- `sync-so-webhook` akzeptiert weiterhin v41/v42/v43 — keine Migrationen nötig, in-flight Jobs sterben sauber
- Retry-Pfad (`retry_v41: true`) baut die Boxen frisch neu (kein Caching des Payload-Bodys), damit bei Plate-Re-Render auch neue Box-Geometrie wirkt

## Telemetrie / Logs

- Dispatch: `v43_official_segments_payload model=lipsync-2-pro asd=bbox speakers=N segments=N`
- Pro Sprecher: `v43 speaker=speaker_2 bbox=[x1,y1,x2,y2] source=face-map|face-gate|fallback`
- Wenn Sync.so trotzdem mit "active speaker not found" failt → automatisch im selben Run einen Retry mit erweiterter Box (pad 8% → 18%) versuchen, dann erst Refund

## Verifikation

1. Szene `5f43e669-b154-4ac9-a516-b46acb7ee288` wird **nicht** automatisch resettet — wir warten, bis erst der v42-Run dieser Szene durch ist und vergleichen. Falls v42 grün: v43 wird auf der **nächsten neuen** 3+ Sprecher-Szene scharf geschaltet. Falls v42 erneut "An unknown error" / "active speaker not found" wirft: gezielter Reset dieser Szene auf v43.
2. Logs müssen `v43_official_segments_payload … asd=bbox` zeigen, kein `coordinates:` mehr in der ausgehenden Payload für 3+ Sprecher.
3. Keine v39/v40 Tight-WAV oder `segments_secs` Marker mehr.
4. Bei Erfolg: `lip_sync_status='applied'`, ein Output-Video mit allen N Sprechern animiert.

## Dateien

- `supabase/functions/compose-dialog-segments/index.ts` — ASD-Builder von Point auf BBox umstellen, Validation + Fallback-Quadrat + Collision-Shift
- `supabase/functions/_shared/twoshot-face-map.ts` (oder Äquivalent) — falls nötig, `bbox()` Helper exportieren der `(cx, cy, w, h) → [x1,y1,x2,y2]` mit Padding macht
- `supabase/functions/sync-so-webhook/index.ts` — v43 in der Versions-Akzeptanzliste, plus 1× Bbox-Pad-Retry (18%) vor finalem Refund
- `mem/architecture/lipsync/v43-bounding-boxes-asd.md` (neu) — kanonische Doku für v43
- `mem/index.md` — Core-Eintrag v41 → v43 aktualisieren

## Nicht-Ziele (bewusst raus aus diesem Plan)

- Kein Cleanup von v5/v23/v26/v32–v42 Code, keine Memory-Konsolidierung, kein Entfernen von `render-sync-segments-audio-mux` — kommt erst nach mindestens einem grünen v43-Run auf einer 3+ Sprecher-Szene.
- 1–2 Sprecher-Szenen bleiben unverändert auf v5 Fan-out — die waren nie das Problem.
- Kein Wechsel des Modells (`lipsync-2-pro` bleibt), kein zweiter ASD-Modus parallel.
