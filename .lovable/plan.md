## Problem

Im Two-Shot Lip-Sync (compose-twoshot-lipsync) wird derzeit nur **ein** Gesicht animiert — der zweite Sprecher bleibt stumm/lippenlos. Wir senden zwei sequentielle Sync.so-Passes mit unterschiedlichen Audiospuren, **aber beide Passes landen auf demselben Gesicht** (dem prominenteren).

## Ursache

Wir senden derzeit:

```ts
{ video, audio, sync_mode: "cut_off", active_speaker: true,
  face_index: p, speaker: p }
```

`face_index` und `speaker` sind **keine gültigen Sync.so-Parameter** — sie werden von Replicate stillschweigend ignoriert. Mit `active_speaker: true` greift dann automatic-speaker-detection, und die wählt in **beiden Passes** dasselbe (prominenteste) Gesicht → Pass 2 überschreibt Pass 1 auf demselben Mund.

So macht es Artlist: Sync.so bietet `options.active_speaker_detection` mit **`frame_number` + `coordinates`** (oder `bounding_boxes`) für deterministische Face-Auswahl. Damit pinnt man pro Pass das **exakte Zielgesicht**.

## Lösung

### 1. Face-Detection einmalig pro Szene
Vor den Lipsync-Passes Gemini Vision (`google/gemini-2.5-flash`) mit dem ersten Frame/Video-URL des Master-Clips aufrufen. Strict-JSON-Antwort:

```json
{ "faces": [
    { "center": [x, y], "side": "left",  "bbox": [x1,y1,x2,y2] },
    { "center": [x, y], "side": "right", "bbox": [x1,y1,x2,y2] }
] }
```

Koordinaten in Pixeln der Video-Auflösung (Hailuo two-shot ist 1280×720 oder 1920×1080 — wir senden die Original-Auflösung im Prompt mit, oder lassen Gemini sie schätzen und normieren später).

Cache das Ergebnis in `composer_scenes.audio_plan.twoshot.faceMap` damit Retries nicht erneut detektieren.

### 2. Pro Pass deterministisches Face-Targeting
Aus `character_shots[i].position` (`left`/`right` oder Index 0/1) → passendes Face aus der Detection mappen.

Pass-Input wird zu:

```ts
{
  video: currentVideo,
  audio: pass.track_url,
  sync_mode: "cut_off",
  temperature: 0.5,
  output_format: "mp4",
  active_speaker: false,                  // Auto-Detect aus
  active_speaker_detection: {
    auto_detect: false,
    frame_number: 0,
    coordinates: [faceX, faceY],          // Mittelpunkt des Ziel-Gesichts
  },
}
```

`face_index`/`speaker` (Bogus-Felder) entfernen.

### 3. Fallback
- Wenn Gemini Detection fehlschlägt oder nicht 2 Gesichter liefert: **Heuristik** — Annahme links/rechts auf Drittel-Position (z. B. links = [W*0.3, H*0.5], rechts = [W*0.7, H*0.5]). Auflösung kommt aus `scene.metadata.master_width/height` (falls vorhanden) oder Default 1280×720.
- Wenn auch das nicht geht: aktuelles Verhalten (silent failover auf `active_speaker: true`) mit Warnung im Log.

### 4. Logging & Sichtbarkeit
- `console.log` pro Pass: `target_face=left|right coords=[x,y]`
- In `audio_plan.twoshot.heartbeat` zusätzlich `targetFace` mitschreiben — das Studio-UI kann später eine kleine "👤 links / 👤 rechts" Anzeige im Progress-Strip rendern.

## Geänderte Dateien

1. **`supabase/functions/compose-twoshot-lipsync/index.ts`**
   - Neue Helper-Funktion `detectFacesInMaster(supabase, sceneId, videoUrl, lovableKey)` → ruft Gemini, cached Ergebnis in `audio_plan.twoshot.faceMap`.
   - Neue Helper-Funktion `pickTargetCoordinates(faceMap, charShot, fallbackDims)` → liefert `[x, y]` für den aktuellen Sprecher.
   - Multi-Pass-Loop (Zeilen ~392–452): Eingabe-Objekt umbauen wie oben. Aufruf der Detection einmal vor dem Loop.

2. **`mem/architecture/lipsync/sync-so-pro-model-policy`**
   - Notiz ergänzen: `active_speaker_detection.coordinates` ist der **richtige** Weg für Two-Shot. `face_index`/`speaker` waren no-ops.

Keine UI-Änderungen, kein DB-Migration. `audio_plan.twoshot.faceMap` ist nur ein neues optionales Feld im bestehenden JSONB.

## Validierung

1. Neue Two-Shot-Szene mit zwei Sprechern triggern (`/video-composer`).
2. Edge-Logs prüfen: `target_face=left coords=[…]` für Pass 1, `target_face=right` für Pass 2.
3. Visuell: Pass 1 animiert linkes Gesicht beim ersten VO-Segment, Pass 2 animiert rechtes Gesicht beim zweiten — beide Münder bewegen sich zur richtigen Zeit.
4. Continuity-Drift sollte < 0.3 bleiben (kein Identitäts-Bleed).
