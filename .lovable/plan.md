# Root Cause: Beide Replicate-Frame-Extractor-Modelle existieren nicht mehr (404)

## Diagnose des 4-Sprecher-Runs (23:56–00:02, ~10 Min, alle Münder zu)

1. **`plate-face-detect` ist tot.** Beide Replicate-Modelle (`lucataco/ffmpeg-extract-frame` und `lucataco/frame-extractor`) liefern **404 Not Found** — sie wurden von Replicate entfernt. Ohne extrahierten Frame keine Plate-Identity: `plate_identity=off, resolved=0`.
2. **Folge 1 — Münder zu:** Der v97-Fix (Skip-Preclip + `bbox-url-pro`) verlangt `resolvedCount > 0` und hat deshalb **nie gegriffen**. Die Pipeline fiel auf Anchor-Rescale-Koordinaten zurück (5–15 % Drift, dokumentiertes v77-Problem) → die Preclip-Crops und Sync.so-Targets saßen neben den Mündern → Sync.so liefert "done", aber kein sichtbarer Lip-Sync.
3. **Folge 2 — 10 Minuten:** 42 s Batch-Preclip-Lambda + globales Inflight-Cap `MAX_INFLIGHT=3`: Pass 1–3 starteten 23:57, **Pass 4 wurde 3,5 Min lang deferred** (DEFER-Schleife mit Jitter-Retries um 23:59, 00:00, 00:01) und lief erst 00:01:36.

## Fix

### A. Frame-Extraktion ersetzen: Gemini-Video-Direkt statt Replicate (Root-Cause)
`validate-frame-face` beweist, dass es ohne Replicate geht: Gemini 2.5 Flash bekommt die **Video-URL direkt** mit Timestamp-Hinweis und liefert Face-Boxen — das funktioniert in Produktion.
- `plate-face-detect.ts` umbauen: statt Frame-PNG via Replicate zu extrahieren, die Plate-Video-URL direkt an Gemini (Lovable AI) schicken — gleiche Prompt-Struktur wie bisher (`askGeminiForPlateFaces`), gleicher Cache (`plate_face_cache`).
- `plate-face-identity.ts` analog: Identity-Matching (Charakter → Gesicht) ebenfalls über das Video-Direkt-Pattern.
- Die toten Replicate-Aufrufe werden entfernt (kein Fallback auf 404-Modelle mehr).

**Effekt:** `plate_identity=on, resolved=4` → v97-Pfad (`v97_multi_speaker_skip_preclip` + `bbox-url-pro` auf voller Plate) aktiviert sich endlich → Koordinaten sitzen auf echten Plate-Gesichtern → Lippen bewegen sich. Batch-Preclip-Lambda (42 s) entfällt komplett.

### B. Inflight-Cap fixen (Speed)
- `MAX_INFLIGHT` von 3 auf 4 anheben, damit eine 4-Sprecher-Szene in einer Welle dispatcht statt Pass 4 minutenlang zu deferren.

### C. UI-Status ehrlich (Carry-over aus letztem Plan)
- Clip-Overlay: bei Pass-Status `retrying` → "Sync.so-Fehler — automatischer Neuversuch X/3" statt "Lip-Sync wird gestartet…".

## Technische Details
- Dateien: `supabase/functions/_shared/plate-face-detect.ts`, `supabase/functions/_shared/plate-face-identity.ts`, `supabase/functions/compose-dialog-segments/index.ts` (MAX_INFLIGHT), Frontend Clip-Overlay-Komponente.
- Kein Schema-Change, keine neuen Secrets (Lovable AI Key vorhanden).
- v96 Force-Repair, Plan-D-Fanout und Retry-Ladder bleiben unverändert.

## Erwartung (nächster 4-Sprecher-Run)
| Phase | Heute | Nach Fix |
|---|---|---|
| Plate-Identity | fail (404) → off | ~10 s, resolved=4 |
| Batch-Preclip-Lambda | 42 s | entfällt (v97-Pfad) |
| Dispatch | 3+1 gestaffelt (Pass 4 +3,5 Min) | 4 parallel |
| **Wallclock** | **~10 Min, Münder zu** | **~2–3 Min, Lippen synchron** |

## Verifizierung
- Logs zeigen `plate_identity=on resolved=4`, `v97_multi_speaker_skip_preclip`, `variant=bbox-url-pro`, kein `DEFER inflight` und kein `plan_b_B_batch_preclip` mehr.
- Sichtprüfung: alle 4 Sprecher bewegen die Lippen im jeweiligen Zeitfenster.