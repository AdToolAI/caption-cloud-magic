# v162 — bbox-url-pro-only, kein Auto-Detect

## Ziel

Nicht zurück zu `auto_detect`. Der Pfad bleibt für **alle Sprecher (1..N)** gleich:

```text
Single-face Preclip pro Pass → sync-3 → auto_detect:false + bounding_boxes_url → Crop-Mux zurück in die Szene
```

## Diagnose aus dem aktuellen Fehler

Sync.so hat `generation_unknown_error` zurückgegeben, obwohl v161 korrekt einen Single-Face-Preclip erzeugt hat.

Der konkrete v161-Fehler liegt sehr wahrscheinlich nicht an bbox-url-pro selbst, sondern an einem **Framecount/FPS-Mismatch im neuen Preclip-Pfad**:

- `renderPassFacePreclip` rendert Preclips mit **30 fps**.
- `compose-dialog-segments` baut die `bounding_boxes_url` aber mit globalem `ASSUMED_FPS` (24 fps).
- Im aktuellen Log: Preclip-Dauer ca. `1.03s`, Bbox-JSON enthält `25` Frames (`1.03 × 24`).
- Der echte Preclip bei 30fps hat aber ca. `31` Frames.
- Sync.so-Doku verlangt: `bounding_boxes` Array-Länge muss exakt zur Video-Frameanzahl passen.
- Genau solche Mismatches führen laut bestehendem Code-Kommentar bereits zu opakem `generation_unknown_error`.

Das erklärt auch, warum die Anfrage sofort bei Sync.so fehlschlägt, obwohl die Box sichtbar plausibel ist.

## Änderungen

### 1. Preclip-FPS korrekt verwenden
In `supabase/functions/compose-dialog-segments/index.ts`:

- Wenn `usePassPreclip === true`, Bbox-Framecount mit **30 fps** berechnen.
- Wenn Full-Plate-Fallback, weiter bestehenden Plate-FPS/`ASSUMED_FPS` verwenden.
- Logmarker:
  - `v162_bbox_framecount space=clip fps=30 ...`
  - `v162_BBOX_URL_PRIMARY ... frames=<echte 30fps frame count>`

### 2. Preclip-Duration direkt aus Render-Metadaten nutzen
- Beim erfolgreichen Preclip-Render `preclip_duration_sec` speichern.
- Für Preclip-Bbox-JSON bevorzugt `preclip_duration_sec × 30` verwenden.
- MP4-Probe bleibt nur Fallback, falls Metadaten fehlen.

### 3. Bounding-Boxes für Preclip weiterhin im Clip-Space
- v161 Clip-Space Transform bleibt erhalten:
  - Plate-Box → Crop-Offset abziehen → auf 720/OutputSize skalieren.
- `bounding_boxes_url` bleibt public JSON mit:

```json
{ "bounding_boxes": [[x1,y1,x2,y2], ...] }
```

- Kein `auto_detect:true`.
- Keine Coordinates.
- Kein lipsync-2-pro.

### 4. Fail-closed statt Silent-Fallback
Wenn Preclip-Bbox-JSON nicht exakt gebaut werden kann:

- Kein Auto-Detect-Fallback.
- Kein Coordinates-Fallback.
- Hard-Fail + Refund mit klarer Meldung.

### 5. Scene-Reset für aktuellen Run
Die aktuelle Szene `a0322789-3703-45c1-a82c-ec846379e177` wird zurückgesetzt, damit keine v161-Failed-Passes oder falsch gecachten 24fps-Bbox-JSONs wiederverwendet werden.

## Verification

Nach Umsetzung muss im Log stehen:

```text
version=v162
v162_preclip_render OK ... fps=30
v162_bbox_framecount space=clip fps=30 dur=... frames=31/69/...
WIRE_PAYLOAD model=sync-3 options={ sync_mode: cut_off, active_speaker_detection: { auto_detect:false, bounding_boxes_url: ... } }
```

Akzeptanz:

- Kein `generation_unknown_error` wegen Framecount-Mismatch.
- Kein `auto_detect` im Sync.so Payload.
- Sprecher 2 bekommt eigenen Single-Face-Preclip + eigene Clip-Space-Bbox.
- Finales Muxing bleibt per `preclip_crop`, damit Nachbargesichter nicht morphen können.
