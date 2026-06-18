## Ziel

Failure-Rate beim Crop von **~19% → ~4%** senken, indem wir Gemini Vision als Primär-Face-Detector durch einen dedizierten Face-Detector ersetzen — wie Sync.so, HeyGen und Hedra es intern tun.

**Kern-Insight:** Gemini ist ein semantisches Vision-LLM, kein Face-Detector. Pixel-genaue Bboxes liefert es nicht zuverlässig. MediaPipe / RetinaFace tun das deterministisch.

## Neue Architektur (3-Layer)

```text
┌─────────────────────────────────────────────────────────────┐
│ Layer 1  PRIMARY DETECTOR                                   │
│ Replicate · chigozienri/mediapipe-face                      │
│ → pixel-genaue Bboxes + Landmarks, ~1s, ~$0.0005           │
│ → 95-99% Recall                                             │
├─────────────────────────────────────────────────────────────┤
│ Layer 2  IDENTITY MATCHER                                   │
│ Gemini 2.5 Flash · bekommt Layer-1-Face-Crops + Portraits   │
│ → "welcher Char ist Face #1?" (semantisch, Gemini-Stärke)  │
├─────────────────────────────────────────────────────────────┤
│ Layer 3  FALLBACK                                           │
│ Gemini Vision Bbox-Detection (heutiger Pfad, degraded mode) │
│ → nur wenn Replicate down / timeout                         │
└─────────────────────────────────────────────────────────────┘
```

## Scope (alles in einem Refactor: A+B+C+E)

### A — Preclip-Face-Gate für N=1 entsperren
Datei: `supabase/functions/compose-dialog-segments/index.ts` (~Z. 3153)
- `if (speakers.length >= 2)`-Guard entfernen.
- Single-Speaker-Preclips laufen ab sofort durch den existierenden 3-Frame-Gate.
- Existing Repair-Loop greift automatisch.

### B — MediaPipe-Detector als neuer Shared-Helper
Neue Datei: `supabase/functions/_shared/face-detect-mediapipe.ts`
```ts
export async function detectFacesMediaPipe(opts: {
  videoUrl: string;
  frameNumbers: number[];    // 1 oder mehrere Frames
  fps?: number;
}): Promise<{
  ok: boolean;
  framesScanned: number;
  faces: Array<{
    bbox: [number, number, number, number];   // x1,y1,x2,y2 in plate-px
    confidence: number;
    landmarks?: { leftEye:[n,n]; rightEye:[n,n]; nose:[n,n]; mouth:[n,n] };
    frameSeen: number;
  }>;
  unionBbox?: [number, number, number, number]; // Multi-Frame
  source: "mediapipe" | "gemini_fallback";
  ms: number;
}>;
```
- Nutzt Replicate-Connector (existierende Auth, kein neuer Secret).
- Frame-Extraktion über bestehende `proxy-video-bytes` Function.
- Timeout 8s pro Frame, parallele Calls für Multi-Frame.
- Idempotenter Cache: erweitere `plate_face_cache`-Tabelle um Spalten `detector` + `landmarks_json`.

### C — Multi-Frame Union (statt Single-Frame Mid)
- Pro Plate 3 Frames scannen: `first`, `mid`, `last`.
- `unionBbox` = Bounding-Hull aller Detections + 10% Padding.
- Center = Median der Bbox-Center.
- Subject-Bewegung während der Szene wird automatisch eingeschlossen → keine verfehlten Crops mehr bei Pan/Walk.

### D — `resolvePlateFaceIdentities` umstellen
Datei: `supabase/functions/_shared/plate-face-identity.ts`
- **Schritt 1**: `detectFacesMediaPipe()` → deterministische Bboxes.
- **Schritt 2**: für jede Bbox einen 256×256 Face-Crop ziehen (canvas im Edge oder via `proxy-video-bytes`).
- **Schritt 3**: Gemini Vision bekommt nur die isolierten Face-Crops + Character-Portraits → Aufgabe: "welcher Crop = welcher Char?" (Identity-Matching, semantisch, Gemini-Stärke).
- **Single-Speaker**: größte Bbox gewinnt (kein Gemini-Call nötig → spart Zeit + Credits).
- **Fallback**: bei MediaPipe-Fail/Timeout → heutiger Gemini-Bbox-Pfad (degraded).

### E — Pre-Dispatch-Face-Gate nutzt denselben Detector
Datei: `supabase/functions/_shared/face-crop.ts` (`validateFrameFace`)
- Umstellen von Gemini-only auf `detectFacesMediaPipe()` als Primary.
- Konsequenz: Face-Gate failed nur noch wenn das Gesicht **wirklich** nicht im Crop ist — nicht weil Gemini einen schlechten Tag hatte.
- Gemini bleibt als Fallback.

### Telemetrie (leichtgewichtig, kein neuer Tab)
- Strukturiertes Logging in jedem Detector-Call:
  ```ts
  console.log("[face-detect]", { detector, frames, faces, confidence_avg, ms, fallback_reason });
  ```
- Optional: kleine Tabelle `face_detect_metrics` (kann später kommen, kein Blocker).

### F — UI-Hinweis im Forensics-Sheet
Datei: `src/components/admin/SyncsoForensicsSheet.tsx`
- Version-Badge auf `v129.21` bumpen.
- Neue Mini-Zeile: `Detector: mediapipe · 3 frames · union-bbox · 1 face` (oder `gemini_fallback`).

## Out of Scope (Phase 2, separater Schritt)

- D-Tabelle `face_detect_metrics` mit Cockpit-Sparkline.
- Re-Crop-Retry vor Hard-Refund (E aus dem alten Plan).
- Plate-Cache-Invalidation auf `source_clip_url`-Change (jetzt schon adressiert durch Cache-Key-Extension).

## Technische Details

### Replicate-Aufruf-Pattern
- Model: `chigozienri/mediapipe-face` (returns face boxes + landmarks).
- Gateway-URL: `https://connector-gateway.lovable.dev/replicate/v1/predictions`.
- Auth: `Authorization: Bearer $LOVABLE_API_KEY` + `X-Connection-Api-Key: $LOVABLE_CONNECTOR_REPLICATE_API_KEY`.
- Polling über Gateway, **nicht** `urls.get`.
- 3 Frames parallel über `Promise.all` → ~2s gesamt.

### Cache-Strategie
- Tabelle `plate_face_cache` (existiert) erweitern:
  - `detector text` (`mediapipe`/`gemini_fallback`)
  - `landmarks_json jsonb`
  - `frames_scanned int[]`
- Cache-Key: `(plate_video_url, frames_sorted_csv, detector_version)`.

### Fehler-Klassen nach v129.21

| Failure-Klasse | Heute | Nach v129.21 |
|---|---|---|
| Gesicht da, Gemini findet keins | ~8% | <1% |
| Bbox ±15% verschoben | ~5% | <0.5% |
| Subject bewegt sich, Single-Frame verfehlt | ~3% | <0.5% |
| Plate wirklich gesichtslos | ~2% | 2% (echter Refund) |
| Sync.so Provider-Bug | <1% | <1% |
| **Gesamt** | **~19%** | **~4%** |

## Files Touched

- **Neu:** `supabase/functions/_shared/face-detect-mediapipe.ts`
- **Neu:** `mem/architecture/lipsync/v12921-mediapipe-primary-detector.md`
- **Edit:** `supabase/functions/_shared/plate-face-identity.ts`
- **Edit:** `supabase/functions/_shared/face-crop.ts`
- **Edit:** `supabase/functions/compose-dialog-segments/index.ts`
- **Edit:** `supabase/functions/syncso-preflight/index.ts` (Detector-Info in Pass-Output)
- **Edit:** `src/components/admin/SyncsoForensicsSheet.tsx` (Detector-Mini-Zeile + Versions-Bump)
- **Migration:** `plate_face_cache` Spalten ergänzen

## Verifikation

1. **Smoke-Test nach Deploy:** kleine Plate mit bekanntem Single-Speaker-Frame → Log muss `detector=mediapipe faces=1 ms<2000` zeigen.
2. **Re-Dispatch der heute fehlgeschlagenen Szene:** Preflight wird grün UND `outbound_payload.frame_number/coordinates` matchen visuell das Gesicht.
3. **7-Tage-Beobachtung:** Failure-Rate von ~19% auf <5% sinkt.

## Voraussetzung

Replicate-Connector ist bereits verknüpft (siehe Memory `replicate` Konfiguration) — kein neuer Secret nötig, keine Approval-Schritte.

---

**Bereit zum Bauen — wenn du grünes Licht gibst, läuft das in einem Rutsch durch.**
