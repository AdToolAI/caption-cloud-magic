## Root cause (verified from DB + Edge-Logs + Sync.so docs)

Letzte Szene `fa433d83-…` (v51) ist „applied", aber nur Speaker 1 bewegt die Lippen. Die Logs zeigen exakt warum:

```
plate-face-detect: ffmpeg-extract-frame SDK failed: 404 Not Found
plate-face-detect: frame-extractor fallback failed: 404 Not Found
plate-face-detect: no frameUrl returned from any extractor
v51 plate_detect=fallback-anchor plate_faces=0 expected=3
v51_official_segments_payload with_box=0 auto_fallback=3
```

Heißt:
1. **Beide Replicate-Modelle (`lucataco/ffmpeg-extract-frame` und `lucataco/frame-extractor`) liefern 404.** Diese Models existieren auf Replicate aktuell nicht (mehr) unter diesem Slug. v51-Plate-Detect kann gar keinen Frame extrahieren → keine Faces → 100 % Fallback auf `auto_detect`.
2. **`auto_detect` von Sync.so lockt bei 3 Personen nur das prominenteste Gesicht** (= Speaker 1). Speaker 2 + 3 bleiben stumm. Genau das Symptom.

Zusätzlich beim Cross-Check der Sync.so-Doku (`/docs/developer-guides/speaker-selection`) ist aufgefallen, **dass unser bisheriger `bounding_boxes`-Payload formal falsch war**, selbst wenn Boxen vorhanden waren:

> `bounding_boxes` is a **per-frame** array. Each entry corresponds to one frame: `[x1,y1,x2,y2]` for that frame's face, or `null`. The number of entries must match the total frame count.

Wir haben pro Segment einen einzigen statischen 4-Tupel mitgegeben. Die Doku erwartet entweder
- **`frame_number` + `coordinates`** (ein Punkt auf dem Gesicht des aktiven Sprechers — die einfache, robuste „Manual selection"-Variante, die Sync.so für Multi-Personen ausdrücklich empfiehlt), oder
- **`bounding_boxes` als per-Frame-Array über alle Frames** (komplexer, nur sinnvoll wenn echte Face-Tracking-Daten vorliegen).

Das erklärt auch, warum v50 mit Boxen wiederholt „unknown error" warf — Schema war nicht doc-konform.

## Finale Lösung: v52 — „Point-Selection nach Doku" + robuster Frame-Extractor

### Teil A (Kernfix, behebt den Bug) — ASD-Mode auf `frame_number` + `coordinates` umstellen

Statt pro Segment ein (formal falsches) `bounding_boxes`-Array bauen wir pro Segment exakt das, was die Sync.so-Doku als kanonisch zeigt:

```jsonc
{
  startTime, endTime,
  audioInput: { refId: "speaker_2", startTime: 0, endTime: 3.0 },
  optionsOverride: {
    active_speaker_detection: {
      auto_detect: false,
      frame_number: round(startTime * 24),
      coordinates: [cx, cy]    // Pixel-Punkt auf dem Gesicht von Speaker 2
    }
  }
}
```

Quelle für `(cx, cy)` in dieser Priorität:
1. **Plate-detected Face-Center** (wenn Frame-Extraktion klappt, siehe Teil B).
2. **Anchor-rescaled Face-Center** (Box-Mitte der Anchor-Face-Map, auf Plate-Pixel skaliert). Punkt-basierte ASD ist toleranter als Box-ASD: selbst wenn der Punkt 30–50 px vom echten Gesicht liegt, snapt Sync.so auf das nächstgelegene Gesicht. Anchor-Rescale ist also als Standalone-Lösung bereits ausreichend für 3 Sprecher.
3. **Even-spaced Heuristik** (`x = 0.2 + 0.6·i/(N-1)`, `y = 0.5`) — nur als allerletzter Fallback, immer noch besser als `auto_detect` für N≥3.

Für 1–2 Sprecher bleibt `auto_detect: true` (funktioniert dort zuverlässig, weniger Code-Pfad).

### Teil B (Härtung) — Plate-Frame-Extraktion ohne kaputte Replicate-Slugs

`_shared/plate-face-detect.ts` neu verdrahten:

1. **Primary:** Gemini 2.5 Flash mit **direktem Video-Input** (Gemini Files API). Wir laden das Plate-MP4 hoch und fragen die Faces direkt im Video ab — kein separater Frame-Extract nötig, eine Provider-Abhängigkeit weniger, kein 404.
2. **Secondary (falls Gemini-Video-Upload fehlschlägt):** Replicate `lucataco/video-to-frames` (existiert, gibt Frame-Sequenz zurück → erstes Element nehmen) ODER neuer Slug, gegen den Replicate-Katalog verifiziert bevor wir ihn committen.
3. **Tertiary:** Skip — Teil A funktioniert ohne Plate-Detect über Anchor-Center-Punkt.

Cache (`plate_face_cache`, 30 d TTL) bleibt unverändert.

### Teil C — Diagnostik & State

`composer_scenes.dialog_shots`:
```
version: 52
engine: "sync-official-segments-v52"
asd_mode: "point_per_segment"
point_sources: ["plate-detected" | "anchor-center" | "even-spaced"]
```

Log-Marker: `v52_official_segments_payload model=lipsync-2-pro asd=point_per_segment speakers=3 source_counts={plate:0,anchor:3,evenspaced:0}`.

Webhook-Gate `sync-so-webhook` auf v41..v52 erweitern.

### Teil D — Test der reparierten Pipeline

1. Deploy `compose-dialog-segments`, `sync-so-webhook`, `_shared/plate-face-detect.ts`.
2. Reset Szene `fa433d83-4b1d-4a27-b20e-2dfce5d17d0c` über `reset-lipsync-scene` (idempotenter Refund, kein doppelter Credit-Abzug).
3. Re-dispatch v52.
4. Verifikation in Edge-Logs + DB:
   - `asd_mode=point_per_segment`
   - `point_sources` mindestens `anchor-center × 3` (Plate-Detect optional)
   - Sync.so Job `COMPLETED`
   - `lip_sync_status='applied'` und im Player **alle 3 Sprecher bewegen die Lippen**.
5. Falls nur 2 von 3 Lippen bewegen: in den Cockpit-Logs prüfen, ob die Anchor-Center auf dem Plate tatsächlich auf Gesichtern liegen (Debug-Bild über `plate_face_cache` Eintrag), ggf. Padding/Skalierung der Anchor→Plate-Transform korrigieren.

## Erwartetes Ergebnis

- 3-Sprecher-Szenen lippen-syncen alle drei Sprecher zuverlässig — auch ohne funktionierende Replicate-Frame-Extraktion, weil Anchor-Center-Punkte für die documented Point-ASD ausreichend genau sind.
- Wenn Plate-Face-Detect zusätzlich greift (Gemini-Video-Pfad), wird die Punkt-Quelle automatisch upgegradet (`source: plate-detected`).
- Keine Sync.so-„unknown error" mehr, weil der Payload dem offiziellen Schema entspricht.
- Bei Fehlern bleibt der automatische, idempotente Credit-Refund unverändert aktiv.

## Was NICHT geändert wird

- Webhook-Logik (außer Versions-Gate auf 52).
- Audio-Mux-Pipeline (`render-sync-segments-audio-mux`).
- Credit-Pricing (`ceil(durationSec) × 9 × passes`).
- 1–2 Sprecher-Pfad (bleibt `auto_detect: true`).
- Anchor-Composition / Hailuo-Render-Pipeline.
