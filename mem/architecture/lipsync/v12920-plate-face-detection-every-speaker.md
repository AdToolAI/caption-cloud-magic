---
name: v129.20 Plate Face Detection für jede Speaker-Anzahl
description: compose-dialog-segments läuft Gemini-Vision Plate-Face-Detection ab N=1 (nicht erst ab N=2); Anchor-Rescale-Koords sind als Sync.so-Ziel verboten; Preflight downgraded auf WARN wenn outbound payload fehlt
type: constraint
---

## Problem (vor v129.20)
- `resolvePlateFaceIdentities` (echte Gemini-Vision-Detection auf der Hailuo-Plate) lief nur bei `speakers.length >= 2`.
- Für 1-Sprecher-Szenen wurde blind die Anchor-Portrait-Koord linear auf die Plate-Dimensionen skaliert.
- Hailuo rendert die Person regelmäßig an einer anderen Stelle als das Portrait → Anchor-Rescale liefert Koords die das Gesicht knapp verfehlen (Beispiel: `[204,171]` während Subject upper-right sitzt).
- Pre-Dispatch Face-Gate (v129.11+) erkennt den Miss und blockt → User sieht roten Preflight ohne dass Sync.so je angerufen wurde.

## Regel (v129.20)
- `compose-dialog-segments/index.ts`: `if (!isAdvance && speakers.length >= 1 && plateDims && sourceClipUrl)` — Plate-Detection ist **Pflicht für jede Speaker-Anzahl**.
- Bei 1-Speaker + mehreren detektierten Faces: größte Bbox (Area) gewinnt → ignoriert Spiegelung/Background-Personen.
- Bei 1-Speaker + 0 detektierten Faces: Hard-Refund mit `clip_error = "plate_face_missing_single_speaker"` über `failLipSync(...)` und 422-Response. **Kein Dispatch mit Anchor-Rescale-Koord**.
- Anchor-Rescale (`pickSpeakerCoordinates`) darf weiterhin als initialer Slot-Default verwendet werden, aber bei vorhandenem `plateIdentityMap.faces[]` IMMER überschrieben werden.

## Preflight-Konsequenz
- `syncso-preflight/index.ts` (v129.20): Wenn `meta.payload_summary.input_video` fehlt UND Pass-Status `failed`/`face_gate_blocked` ist, wird `face_at_frame` von `fail` auf `warn` downgraded mit Note "Preclip wurde nie an Sync.so gesendet". Response enthält `resolved.dispatch_never_happened: true`.
- `SyncsoForensicsSheet` rendert in dem Fall eine **rote Pille** „Preclip nicht dispatcht — Crop-Bug vor Versand" statt einer irreführenden FAIL-Reihe neben grünen PASS-Reihen.

## Verifikation
- Edge-Log zeigt `plate-identity faces=N resolved=N/1` auch bei 1-Speaker-Hooks.
- Sheet nach erfolgreichem Dispatch: `source=preclip · frame=1 · coord=[…]`.
- Sheet wenn Plate gesichtslos: rote Pille + sauberer Refund statt stillem Sync.so-Fehler.
