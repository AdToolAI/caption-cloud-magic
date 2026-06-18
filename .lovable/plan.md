## Antwort

Ja. Wir sollten **nicht weiter Replicate-/lucataco-Modelle** für diesen kritischen Preflight verwenden. Das sind Community-/Marketplace-Modelle ohne stabile Verfügbarkeit; genau deshalb laufen wir in 404/Schema-/Output-Probleme.

Für einen Artlist-/Production-Style Workflow ist die richtige Klasse von Anbieter:

1. **AWS Rekognition DetectFaces** — beste Wahl für uns
   - Produktions-API, nicht Community-Modell
   - liefert BoundingBox, Confidence, Landmarks, Pose
   - erkennt bis zu 100 Faces pro Bild
   - passt gut, weil das Projekt ohnehin schon AWS/Remotion-Lambda nutzt

2. **Google Cloud Vision Face Detection** — guter Fallback
   - ebenfalls stabile Produktions-API
   - liefert FaceAnnotations, BoundingPoly, Landmarks
   - sinnvoll als zweite Stufe, falls AWS keine Faces findet oder Secrets fehlen

3. **Azure Face API** — eher nicht als Default
   - technisch gut, aber Zugang ist eingeschränkt / managed customer eligibility
   - für schnelle Stabilisierung weniger geeignet

Artlist selbst wird sehr wahrscheinlich eine interne Kombination aus ML/CV-Modellen, Qualitätsgates und manuellen Asset-Metadaten nutzen; diese konkrete Pipeline ist nicht als öffentliche API verfügbar. Für uns ist **AWS Rekognition + optional Google Vision** der zuverlässigste Weg.

## Neuer Plan v129.22 — Managed Face Detection statt Replicate

### 1. Replicate-Face-Detector deaktivieren

In `supabase/functions/_shared/face-detect-mediapipe.ts`:

- keine weiteren Calls zu:
  - `chigozienri/mediapipe-face`
  - `lucataco/ffmpeg-extract-frame`
  - `lucataco/face-detection-*`
- Datei entweder inhaltlich als Compatibility-Wrapper behalten oder sauber umbenennen/ersetzen durch einen neutralen Detector-Adapter.
- Rückgabeformat bleibt kompatibel mit bestehender Pipeline:

```ts
{
  ok: boolean,
  faces: [{ bbox, center, confidence, landmarks?, frameSeen }],
  framesScanned,
  unionBbox,
  source,
  ms,
  error?
}
```

Damit müssen `syncso-preflight` und Face-Gate nicht komplett neu gebaut werden.

### 2. AWS Rekognition als Primary Detector einbauen

Neuer Shared-Adapter, z. B. intern:

```ts
detectFacesManaged({ frameUrl, imgW, imgH })
```

Implementierung:

- Canvas-/Prebuilt-Frame-URL wird wie jetzt genutzt.
- Edge Function lädt das Bild serverseitig als Bytes.
- AWS Rekognition `DetectFaces` wird mit `Attributes: ['DEFAULT']` oder `['ALL']` aufgerufen.
- Rekognition BoundingBox ist normalisiert (`Left`, `Top`, `Width`, `Height`) und wird in Pixel-Koordinaten umgerechnet:

```ts
x1 = Left * imgW
y1 = Top * imgH
x2 = (Left + Width) * imgW
y2 = (Top + Height) * imgH
```

- Faces werden nach `confidence` gefiltert, z. B. `>= 80`.
- Faces werden left-to-right sortiert, damit bestehende Speaker-Zuordnung stabil bleibt.

### 3. Optionaler Google Vision Fallback

Wenn AWS:

- keine Credentials hat,
- API-Fehler liefert,
- oder 0 Faces findet,

kann optional Google Vision Face Detection als zweite Stufe laufen.

Fallback-Reihenfolge:

```text
AWS Rekognition
  -> Google Vision Face Detection optional
    -> Gemini Vision fallback existing
```

Gemini bleibt nur noch semantischer Notfall-Fallback, nicht mehr Primary.

### 4. Forensik eindeutig machen

In `syncso-preflight` und `SyncsoForensicsSheet`:

Neue Felder anzeigen:

```text
FACE_DETECT_PROVIDER: aws_rekognition | google_vision | gemini_fallback
FACE_DETECT_MODEL: detect_faces | face_detection
FACE_DETECT_FACES: n
FACE_DETECT_MS: n
FACE_DETECT_ERROR: ...
```

Der Screenshot-Fehler würde danach nicht mehr irreführend `MEDIAPIPE_ZERO_FACES` heißen, sondern z. B.:

```text
FACE_DETECT_PROVIDER: aws_rekognition
FACE_DETECT_FACES: 2
FACE PROBE: MANAGED_FACE_DETECTOR
```

oder bei echtem Failure:

```text
FACE_DETECT_PROVIDER: aws_rekognition
FACE_DETECT_ERROR: no_credentials | api_error | zero_faces
FALLBACK: gemini_vision
```

### 5. Preclip-Gate bleibt zunächst unverändert

Der rote Fehler im Screenshot:

```text
Preclip nicht dispatcht — Crop-Bug vor Versand
```

ist Folgefehler. Erst muss der Face-Detector zuverlässig echte Face-Boxen liefern. Danach prüfen wir, ob der Intent-Koordpunkt innerhalb der neuen AWS-Box liegt und ob die Crop-Transformation noch falsch ist.

### 6. Secret-/Config-Check

Vor Implementierung prüfen:

- ob vorhandene AWS-Credentials aus der Remotion/Lambda-Integration serverseitig verfügbar sind,
- welche Region genutzt wird,
- ob Rekognition in dieser Region aktiv ist.

Wenn AWS-Credentials nicht verfügbar sind, dann:

- entweder AWS-Rekognition-Secrets hinterlegen,
- oder direkt Google Vision als Primary nehmen.

### 7. Verification

Nach Deployment gleiche Forensik-Szene erneut laufen lassen.

Erwartet:

```text
FACE PROBE: MANAGED_FACE_DETECTOR
FACE_DETECT_PROVIDER: aws_rekognition
FACE_DETECT_FACES: 2
FACE_DETECT_MS: ca. 300-1200ms
```

Danach prüfen:

```text
Preclip nicht dispatcht
```

Wenn dieser Fehler weiter bleibt, ist die nächste echte Ursache die Crop-/Koordinaten-Transformation, nicht mehr Face Detection.

## Nicht-Ziele

- kein weiterer lucataco-/Replicate-Face-Detector-Test
- keine Änderung an Sync.so Payload-Schema
- keine Änderung an Refund-/Watchdog-Logik
- keine Änderung an Dialog-Shot-Dispatch außer der Preflight-Face-Detection

## Empfehlung

Ich würde **AWS Rekognition als Primärdetektor** implementieren und Replicate in diesem Pfad vollständig entfernen. Das ist der sauberste Schritt in Richtung Artlist-ähnlicher Zuverlässigkeit.