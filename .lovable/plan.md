## Befund

Pass 1 lipsynct sauber, Pass 2 trifft erneut Charakter A — typisches Multi-Speaker-Problem. Ursachen-Analyse anhand der offiziellen Sync.so-Doku (`/v2/generate`):

1. **Wir benutzen Replicate's `sync/lipsync-2-pro` Wrapper, nicht die echte Sync.so-API.**
   - Das offizielle Feld heisst `options.active_speaker_detection.{auto_detect, frame_number, coordinates, bounding_boxes, v3}` (verschachtelt unter `options`).
   - Replicate flacht den Input zu Top-Level-Feldern ab und ignoriert unbekannte/verschachtelte Keys still. Unser `active_speaker_detection`-Objekt sowie `face_index`/`speaker` werden also vermutlich nie an das Modell weitergereicht → Sync.so läuft im Auto-Detect-Modus und pickt beide Male das prominenteste Gesicht (= Charakter A).
   - Genau das deckt sich mit "ein Voiceover klappt, das zweite ist weiterhin fehlerhaft".

2. **Koordinaten werden im falschen Bezugssystem berechnet.**
   - Wir lassen Gemini Faces im Anker-Bild (1:1, oft 1024×1024) erkennen und schicken die Pixel an Sync.so. Sync.so erwartet aber Koordinaten im Pixelraum des **Video-Frames** (z. B. 1280×720 von Hailuo) — bei abweichendem Seitenverhältnis liegen die Punkte falsch.

3. **Pass 2 läuft auf dem Output von Pass 1.**
   - Selbst mit korrekter ASD ist Charakter A's Mund jetzt animiert → erscheint als "aktiver Sprecher" → Auto-Detect snapt zurück auf A. Artlist macht stattdessen einen einzigen Call mit per-Frame-Speaker-Mapping.

## Plan (Artlist-Parität)

### 1. Direkte Sync.so-API statt Replicate-Wrapper
- Neuen Secret `SYNC_API_KEY` einführen (über `secrets--add_secret`, blocker bis Key da ist).
- `compose-twoshot-lipsync` ruft `POST https://api.sync.so/v2/generate` direkt mit `model: 'lipsync-2-pro'` + `options.active_speaker_detection` auf. Polling via `GET /v2/generate/{id}` bis `COMPLETED`/`FAILED`.
- Nur dieser Pfad garantiert, dass ASD-Parameter wirklich ankommen.

### 2. Ein Call statt zwei Passes (Artlist-Style)
- Aus den per-speaker WAV-Tracks bauen wir ein **gemischtes Audio** + einen **Bounding-Box-Track** pro Frame:
  - Für jedes Frame `f` (bei sceneFps): bestimme aus `metadata.speakers[*].segments` welcher Sprecher gerade spricht → setze `bounding_boxes[f] = bboxOfThatSpeaker`, sonst `null` (Stille = kein Lipsync).
- Schicke ein einziges Sync.so-Request:
  ```json
  {
    "model": "lipsync-2-pro",
    "input": [
      { "type": "video", "url": <silent master> },
      { "type": "audio", "url": <merged twoshot wav> }
    ],
    "options": {
      "sync_mode": "cut_off",
      "active_speaker_detection": {
        "auto_detect": false,
        "v3": true,
        "bounding_boxes": [ /* per-frame [x1,y1,x2,y2] | null */ ]
      }
    }
  }
  ```
- Vorteil: Kein Pass-1-Mund-Artefakt mehr, ein deterministischer Render, Kosten 14 statt 28 Credits.

### 3. Face-Detection auf dem echten Video-Frame
- `detectFacesInMaster` nutzt **zuerst** das `lip_sync_source_clip_url`-MP4 (Gemini ingestiert den First-Frame und liefert Pixel im Video-Koordinatensystem). Anker nur als Fallback.
- Frame-Größe (`videoWidth`, `videoHeight`) wird mit dem Result gespeichert und als Bezugssystem für alle Bounding-Boxes verwendet.
- Wenn Gemini nur 1 Gesicht findet → harter Fehler statt heimlich auf Heuristik zu fallen (verhindert "still nur ein Charakter").

### 4. Bounding-Box-Track aus Speaker-Segmenten
- Helper `buildBoundingBoxTrack({ fps, durationSec, speakers, faceMap })`:
  - Für jeden Frame: prüfen, ob ein `speakers[i].segments[j]` (start..end in Sekunden) den Zeitstempel enthält. Erster Treffer gewinnt.
  - Mappe `character_id`/`shotIdx` → `faceMap.faces[side]` → `[x1,y1,x2,y2]`.
- `fps` wird aus dem Scene-Default (24) genommen oder optional via Gemini geschätzt.
- Speichern in `audio_plan.twoshot.bboxTrack` (komprimiert: RLE-style) für Debug & Re-Render.

### 5. Fallback & Heartbeat
- Wenn `SYNC_API_KEY` fehlt: klarer 412-Fehler statt stiller Replicate-Fallback.
- Heartbeat protokolliert `mode: 'single-call-bbox-track'`, `frames`, `framesWithSpeaker`, `faceMapSource` für UI-Sichtbarkeit.
- Idempotenter Credit-Refund über deterministische UUID bleibt erhalten.

### 6. UI / Audio-Mux unverändert
- `audio_plan.twoshot.useExternalAudio = true` bleibt — das gemischte WAV bleibt die Master-Audio-Spur im Export.
- `ClipsTab`-Hinweis aktualisieren: "Multi-Sprecher Two-Shot via Sync.so v2 ASD (Artlist-Parität)."

## Technische Dateien

- `supabase/functions/compose-twoshot-lipsync/index.ts` — Replicate raus, Sync.so direkt rein, Bounding-Box-Track-Builder, harter Fehler bei <2 Faces
- `mem/architecture/lipsync/sync-so-pro-model-policy` — neue Pipeline dokumentieren
- `src/components/video-composer/ClipsTab.tsx` — Hinweistext

## Voraussetzung

- Secret `SYNC_API_KEY` (Sync.so Dashboard → API Keys). Ohne diesen Key kann der Wechsel nicht aktiviert werden.

## Ergebnis

```text
silent two-shot master
  ├─ merged twoshot WAV (alle Sprecher gemischt)
  └─ per-frame bounding-box track (A | B | null)
        ↓ ein Sync.so /v2/generate Call mit ASD v3
final lip-synced video (beide Charaktere am richtigen Punkt) + externe Master-Audio
```

Das eliminiert beide Root-Causes: ASD-Parameter werden garantiert übernommen, und Pass-1-Mund kann Pass-2 nicht mehr "überstimmen".
