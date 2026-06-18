# Warum „alles grün" trotzdem failed

Aus dem letzten Dispatch (`syncso_dispatch_log`, scene `48b812f7…`):

- **Preflight-Panel prüft:** Plate-MP4, Frame **33**, Coord **[204,171]** → grün
- **An Sync.so geschickt wird aber:** Preclip-MP4 (`dialog-pass-preclip-…-p0-…mp4`, Dauer 2.17 s), Frame **1**, Coord **[363,360]** (skaliert × 2.9752 in 720×720-Crop x=82,y=50,size=242)
- **Sync.so Antwort:** `generation_unknown_error` („Something went wrong…")

Die grüne Banner-Zeile sagt das eigentlich schon korrekt: „Preflight grün — wenn Sync.so trotzdem failed, ist es ein Provider-Bug." Aber das stimmt nur, **wenn das Preflight tatsächlich denselben Input prüft wie Sync.so sieht**. Aktuell prüft es eine andere Datei (Plate statt Preclip) und einen anderen Frame (33 statt 1) — also kann es legitim grün sein und Sync.so trotzdem zu Recht failen, weil im Preclip-Frame 1 bei [363,360] kein Gesicht ist (z. B. Augenblinzel-Frame, Bewegungsunschärfe, Crop-Rand).

# Plan v129.19 — Preflight = Provider-Input

## 1. `_shared/syncso-preflight.ts` (oder das Modul, das Preflight rendert)
Quelle ändern auf den **tatsächlichen Outbound-Payload**:
- `video_url` = `payload_summary.input_video` (Preclip), **nicht** Plate
- `coords` = `outbound_payload.options.active_speaker_detection.coordinates`
- `frame_number` = `outbound_payload.options.active_speaker_detection.frame_number` (1)

So validiert „Gesicht am ASD-Frame" exakt das Bild + Coord, das Sync.so sieht.

## 2. Face-Gate-Verschärfung im Preflight selbst (nicht nur server-seitig)
- Wenn `validateFrameFace` für **Frame 1 des Preclips** an [363,360] kein Gesicht findet → Preflight rot mit Verdict `no_face_at_preclip_coord` + roter Punkt im extrahierten Frame an [363,360].
- Optional: zusätzlich Frame mid und last des Preclips, wie server-seitig in `compose-dialog-segments`.

## 3. UI: extrahierten Frame mit Overlay
- Den extrahierten Preclip-Frame im Sheet (gleiche Stelle wie aktuell) anzeigen mit eingezeichnetem ASD-Punkt + 720×720-Crop-Box.
- Zusatzfeld „SOURCE: preclip · frame=1 · coord=[363,360]" anstelle der heutigen Plate-Werte.

## 4. Banner-Text korrigieren
- Wenn neuer Preflight grün ist: Text bleibt „Provider-Bug → Bundle exportieren".
- Wenn rot: Text „Preclip-Crop trifft kein Gesicht — Recrop/Refund nötig", mit Quick-Action „Pipeline ohne Dispatch neu generieren" (überspringt Sync.so).

## 5. `SyncsoForensicsSheet.tsx`
- Versions-Badge auf `v129.19`.
- Neue Felder anzeigen: `outbound_video_url`, `outbound_frame`, `outbound_coords`, `preclip_crop {x,y,size,outputSize}`.

## 6. Memory-Update
- `mem://architecture/lipsync/sync-3-doc-strict-options-v106`: ergänzen „Preflight MUSS Provider-Input (Preclip + transformierte Coord + frame_number) prüfen — nie die Plate."

## Was NICHT geändert wird
- Keine Änderung an `compose-dialog-segments` Crop-/Gate-Logik aus v129.18 (die ist korrekt).
- Keine Änderung am Sync.so-Aufruf selbst.
- Keine Änderung an Refund-Logik (greift schon bei FAILED).

## Erwartetes Ergebnis
Beim nächsten Run einer der beiden Fälle, **unambig**:
- **Preflight rot** → wir haben einen echten Crop-/Frame-1-Bug → fixen wir mit Recrop oder Frame-Shift (z. B. ASD-Frame nicht auf 1 sondern auf einen Frame mit offenen Augen).
- **Preflight grün** → wir haben gesichert einen Sync.so-Provider-Bug → Bundle + Support, ohne weiter im Code zu suchen.
