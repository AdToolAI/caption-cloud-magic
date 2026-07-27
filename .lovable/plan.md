# Plan v276 — Latency-Fix & Soft-Gate

Ziel: Sync.so-Dispatch bei 4-Sprecher-Szenen wieder in ~1:30–2 min statt 8+ min, ohne Identitäts-Regression.

## Ursachen (verifiziert)

- **v274-Hard-Gate** blockt N≥3, wenn Rekognition nicht alle Speaker matcht. Szene `e1265769…`: `resolved=2/4 → clip_status=awaiting_manual_face_map` → Sync.so wurde nie angeworfen. Das ist der 8-min-Hänger.
- **Gemini 3 Pro Anchor (v271)** ist ~2 min langsamer als Nano Banana 2. NB2 hat laut Nutzer-Feedback **kein** Identitäts-Morphing verursacht — Morphing kam erst mit v266 (Anchor komplett raus).
- **Rekognition MIN_SIMILARITY=55** ist für Profile/Occlusions zu strikt und produziert die häufigen 2/4-Fälle.

## Änderungen

### 1. `supabase/functions/compose-video-clips/index.ts` — Soft-Gate
`needsManualReview`-Logik (Zeilen ~2862–2897) umbauen:
- Hard-Block **nur** wenn `resolvedCount === 0` bei N≥2 → dann `awaiting_manual_face_map` wie bisher.
- Bei `0 < resolvedCount < expected`: Szene läuft weiter. `assignmentLock` enthält die matchbaren Slots deterministisch, unresolved Slots fallen auf v242 Row-Major zurück. `audio_plan.twoshot.anchor_identity.status = "partial"` + `matched=[…]` / `unresolved=[…]` für UI-Warnung.
- FaceMapReviewDialog bleibt für den 0/N-Fall erhalten.

### 2. `supabase/functions/compose-scene-anchor/index.ts` — Modell-Reihenfolge
- Default für N≥2 zurück auf `nano-banana-2`.
- `gemini3pro` nur noch als **Auto-Fallback**, wenn NB2 nach 1 Retry den v262-Face-Size-/Face-Count-Gate nicht besteht.
- Solo-Szenen (N=1): unverändert NB2.

### 3. `supabase/functions/_shared/resolveIdentityViaRekognition.ts` — Two-Pass
- Pass 1: `MIN_SIMILARITY = 55` (wie heute) auf alle Slots.
- Pass 2: für noch unresolved Slots erneut mit `MIN_SIMILARITY = 45` gegen dieselben Cast-Portraits + Focus-Plate-Referenzen.
- `method`-Feld erweitert um `"rekognition_two_pass"` für Logging.

### 4. UI — Partial-Warnung
- `SceneClipProgress.tsx` liest `audio_plan.twoshot.anchor_identity.status`.
- Bei `partial`: kleiner gelber Hinweis „Identität: X/N biometrisch bestätigt, restliche via Reihenfolge". Kein Blocker.
- Bei `awaiting_manual_face_map` (0/N): bestehender „Face-Map prüfen"-Button bleibt.

## Nicht-Ziele

- Keine Änderung an Sync.so-Dispatch, Focus-Plates, oder v275 Assignment-Lock-Freeze.
- Kein Rebuild von v274 — nur Gate-Semantik + Threshold.
- Kein Rückbau von v266/v267 Anchor-Referenz-Logik.

## Verifikation

1. Neue 4-Sprecher-Szene rendern, Szenen-ID notieren.
2. Logs prüfen: `v274_enter` → `v274_result` mit `method="rekognition"` oder `"rekognition_two_pass"`, `resolved≥2`.
3. `clip_status` geht **nicht** auf `awaiting_manual_face_map` bei partial.
4. Sync.so-Dispatch startet innerhalb ~90 s nach Anchor-Pin.
5. Bei matchbaren Slots: korrekter Lip-Sync auf richtigem Speaker verifizieren.

## Rollback

- Env-Flag `V276_SOFT_GATE=false` → Verhalten wie v274 (hard).
- Env-Flag `ANCHOR_MODEL_DEFAULT=gemini3pro` → Anchor-Modell wie v271.
