## Problem

Forensics-Panel zeigt `GEMINI_MS: 1509` und `EXTRACTED FRAME (V129.18 · CLIENT CANVAS)` → MediaPipe wird **im Forensics-Pfad nicht** verwendet.

Du hast recht: v129.21 hat MediaPipe nur in `compose-dialog-segments` (= echter Dispatch) zum Primär-Detector gemacht. Das Forensics-Sheet ruft aber `syncso-preflight` auf, und dort gibt es eine eigene `probeFaceAtFrame()`-Funktion, die **direkt Gemini** anspricht — weder `detectFacesMediaPipe` noch das bereits MediaPipe-fähige `validate-frame-face` werden genutzt.

```
Echter Dispatch  →  compose-dialog-segments  →  MediaPipe ✓  (Gemini Fallback)
Forensics-Probe  →  syncso-preflight         →  Gemini ✗   ← hier liegt der Bug
```

## Fix (v129.21.3 — Forensics-Preflight angleichen)

Eine Datei: `supabase/functions/syncso-preflight/index.ts`

**Reihenfolge in `probeFaceAtFrame()`:**

1. **MediaPipe-Primary:** `detectFacesMediaPipe({ videoUrl, plateWidth, plateHeight, durationSec, frameTimestamps: [frameNumber/30] })` — gleiche Helper wie der Dispatch-Pfad. Liefert Faces inkl. Bounding Boxes für den Ziel-Timestamp.
   - 1 Face am ASD-Coord (±0.15) → `verdict: yes_one_face_at_coord`, `status: pass`, `source: "mediapipe"`.
   - 1 Face, aber außerhalb Toleranz → `yes_but_not_at_coord`, `status: fail`.
   - ≥2 Faces → `multiple_faces`, `status: fail`.
   - 0 Faces → **kein** Sofort-Fail, sondern Gemini-Fallback (MediaPipe hat höhere False-Negative-Rate bei seitlichen Gesichtern, siehe v129.21-Memo).
2. **Gemini-Fallback** (bestehende Logik): nur wenn MediaPipe `ok:false` ODER 0 Faces. Antwort markiert mit `source: "gemini_fallback"`.
3. **Skip-Pfad** unverändert wenn weder Replicate-Token noch Gemini-Key gesetzt.

**Probe-Frame-Strategie:**
- Wenn `probe_frame_url` (Client-Canvas-JPEG) vorhanden ist, **MediaPipe trotzdem** auf das volle Plate-Video laufen lassen — Replicate-MediaPipe braucht ein Video, kein Einzel-JPEG. Der Client-JPEG bleibt nur für den Gemini-Fallback relevant (so wie heute).

**Result-Schema-Erweiterung** (`face_at_frame.*`):
- Neue Felder: `source: "mediapipe" | "gemini" | "gemini_fallback" | "skipped"`, `mediapipe_ms`, `mediapipe_faces`, `mediapipe_error?`.
- `gemini_ms` bleibt erhalten (nur befüllt wenn Gemini auch lief).

## UI-Sync (Forensics-Sheet)

`src/components/admin/SyncsoForensicsSheet.tsx`:
- Label `EXTRACTED FRAME (V129.18 · CLIENT CANVAS)` → `FACE PROBE (V129.21.3 · MEDIAPIPE PRIMARY)` und Quelle (`SOURCE` Zeile) aus `face_at_frame.source` einblenden.
- Felder `MEDIAPIPE_MS` + `GEMINI_MS` nebeneinander anzeigen (`—` wenn nicht gelaufen).
- Roter "Preclip nicht dispatcht"-Banner unverändert (das ist eine andere Stage).

## Verifikation

1. Forensics-Sheet auf bestehender Szene öffnen → `SOURCE = mediapipe`, `MEDIAPIPE_MS` ~600–1500ms, `GEMINI_MS = —`.
2. Künstlicher Test mit gesichtsloser Plate (z. B. Landschaft) → MediaPipe 0 Faces → Gemini Fallback läuft → `SOURCE = gemini_fallback`, beide MS-Werte gesetzt.
3. Ohne Replicate-Token (lokaler Edge-Test) → `SOURCE = gemini`, alter Pfad bleibt funktional.
4. Edge-Logs zeigen `[syncso-preflight] face-probe source=mediapipe verdict=yes_one_face_at_coord ms=...`.

## Nicht enthalten

- Keine Änderung am Dispatch-Pfad (`compose-dialog-segments` ist seit v129.21 schon korrekt).
- Keine neuen Watchdog-Regeln (v129.21.2 bleibt aktiv).
- Keine UI/UX-Änderungen außerhalb des Forensics-Sheets.