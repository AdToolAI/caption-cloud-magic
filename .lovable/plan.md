# Fix: Face-Detection darf nie wieder still scheitern (v97)

## Root Cause (Szene e1c0af12, 20:25 Uhr)

Zwei unabhängige Ausfälle in derselben Minute haben die v96-Reparatur komplett ausgehebelt:

1. `plate-face-detect`: Replicate-Frame-Extraktion schlug fehl → keine Plate-Identity, Anchor-Koordinaten (y≈202) statt echter Mundpositionen (y≈400).
2. `validate-frame-face` schickt die **MP4-URL direkt als Bild** an Gemini. Das AI-Gateway lehnt das jetzt ab: `400 Unsupported image format`. Dadurch: keine Face-Boxes → v96-Force-Repair konnte nicht greifen → Soft-Pass mit falschen Koordinaten → leere Preclip-Crops → keine Lippenbewegung, 9:25 min und Credits verbrannt.

Stage B (Batch-Preclip) war nicht schuld — lief sauber (4/4 in 45s) und bleibt aktiv.

## Änderungen

### 1. `validate-frame-face`: PNG statt MP4 an Gemini
- Vor dem Gemini-Call einen echten PNG-Frame extrahieren (gleiche Replicate-Extraktoren wie `plate-face-detect`, als gemeinsamer Shared-Helper mit 2 Versuchen pro Extraktor + kurzem Backoff).
- PNG in den `composer-frames` Bucket rehosten und **diese** URL an Gemini geben — MP4-als-Bild wird komplett entfernt.
- Frame-PNG pro (video_url, frame_number) cachen, damit Retries kostenlos sind.

### 2. Face-Gate-Härtung in `compose-dialog-segments` (3+ Sprecher)
- Wenn `validate-frame-face` keine Boxes liefert: einmaliger Fallback auf `detectPlateFaces` (hat eigenen Cache) bevor aufgegeben wird.
- Wenn danach **immer noch keine** Plate-Face-Boxes existieren: **Fail-Fast statt Blind-Dispatch** — Szene wird sofort als `failed` markiert, Credits automatisch erstattet, klare Fehlermeldung ("Gesichtserkennung auf dem gerenderten Video fehlgeschlagen — bitte erneut starten"). Kein 9-Minuten-Lauf mehr, der garantiert tot ist.
- Telemetrie: `face_repair.source` bzw. Block-Grund landet wie bisher im Dispatch-Log, damit der nächste Lauf in 30 Sekunden diagnostizierbar ist.

### 3. Verifikation
- Edge Functions neu deployen, dann dieselbe 4-Sprecher-Szene erneut rendern.
- Erwartung in den Logs: `FACE-GATE REPAIR (v96-force)` auf allen 4 Pässen mit `preclip_crop.y ≈ 280–380`, oder (falls Extraktion erneut ausfällt) sofortiger Abbruch mit Refund statt 9-Minuten-Blindlauf.

## Technische Details
- Neuer/erweiterter Shared-Helper: `_shared/plate-face-detect.ts` → `extractPlateFrame` wird exportiert und von `validate-frame-face` mitbenutzt (Retry-Logik dort zentral).
- 1- und 2-Sprecher-Flows bleiben unverändert (stabil).
- Keine DB-Migration nötig; `frame_face_cache` wird weiterverwendet (zusätzlich Frame-URL im Result gespeichert).
- Kosten: +1 Replicate-Frame-Extract pro Erstvalidierung (~0,001 €), dafür keine toten Sync.so-Läufe mehr.