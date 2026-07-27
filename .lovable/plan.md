# Plan v274 — Speaker↔Face Identity via AWS Rekognition

## Ziel

Silent-Misfires beheben, bei denen `plate_identity.resolvedCount = 0` und der Dispatcher auf "Slot-Reihenfolge = Script-Reihenfolge" zurückfällt — mit dem Ergebnis, dass Audio auf falsche Gesichter geroutet wird (z.B. Sprecher 4 landet bei Position 1).

Ursache: Im Anchor-Schritt läuft bisher **kein** Identitäts-Matching. Slots werden rein geometrisch vergeben.

Lösung: AWS Rekognition matched die im Anchor detektierten Gesichter gegen die bereits vorhandenen Cast & World Portrait-Descriptors.

## Umfang

- Nur der Anchor-Schritt für N≥2 Sprecher.
- N=1 bleibt unverändert.
- Keine Änderung an Cast & World, Focus-Plates, Sync.so oder Rendering.
- Bonus-Idee (Focus-Plates als zusätzliche Referenz) **nicht** enthalten — Risiko von Style-Drift-Fehlmatches.

## Änderungen

### 1. Neue Utility: `resolveIdentityViaRekognition`
- Input: Anchor-Bild-URL + Liste `{ characterId, portraitUrl }` aus Cast.
- Ablauf:
  1. `DetectFaces` auf dem Anchor → Bounding-Boxes.
  2. Pro Cast-Portrait `CompareFaces` gegen jede Bounding-Box.
  3. Hungarian-Assignment über die Similarity-Matrix (optimale globale Zuordnung, keine Greedy-Doppelbelegung).
  4. Threshold: Similarity ≥ 55. Alles darunter → `unresolved`.
- Output: `Array<{ boxIdx, characterId | null, similarity }>`.

### 2. Dispatcher-Guard in `compose-video-clips`
- Nach Anchor-Generierung `resolveIdentityViaRekognition` aufrufen.
- Ergebnis in `plate_identity.faces[]` und `resolvedCount` schreiben.
- Für N≥3 Sprecher: harter Stop, wenn `resolvedCount < N` → Szene auf `clip_status = 'awaiting_manual_face_map'`.
- Für N=2: Soft-Warn, aber weiter (2-Sprecher-Fehlzuordnung ist audit-visuell schnell erkennbar).

### 3. Manuelle Review-UI: `FaceMapReviewDialog.tsx`
- Zeigt Anchor-Frame mit numerierten Bounding-Boxes.
- User zieht Speaker-Chip auf die passende Box (Drag & Drop).
- Speichern → `plate_identity.faces[]` überschreiben, `clip_status` zurück auf `awaiting_render`.
- Trigger aus `SceneClipProgress.tsx` wenn Status = `awaiting_manual_face_map`.

### 4. One-Shot DB-Fix
- Szene `ef5bff66…` auf `awaiting_manual_face_map` setzen, damit der User sie direkt über den neuen Dialog reparieren kann.

## Was NICHT geändert wird

- Cast & World Portraits, `IndexFaces`, Rekognition-Collection — bleiben unangetastet.
- Focus-Plates / SPF Phase 1 — kein Einfluss.
- Anchor-Modell (Gemini 3 Pro Image) — kein Wechsel.
- Sync.so Pipeline, dialog-stitch, Rendering — kein Eingriff.
- Grid-Layout-Detection v273 — bleibt.

## Risiken & Mitigation

- **Zwillinge / sehr ähnliche Charaktere:** Hungarian-Assignment verhindert Doppelbelegung; unter Threshold → Manual Review statt Silent-Misfire.
- **Rekognition-Latenz:** ~800ms extra pro N≥2-Szene. Akzeptabel gegenüber Re-Render-Kosten.
- **Kosten:** ~$0.001 pro Szene (4× CompareFaces). Vernachlässigbar.
- **Neuer State `awaiting_manual_face_map`:** einmalig testen dass Webhook und UI ihn korrekt handhaben.

## Erwartung

- ~90% aller aktuellen Slot-Misfires bei N≥3 verschwinden.
- Verbleibende ~10%: Manual Review — kein Silent Fail mehr, User hat volle Kontrolle.
- Keine Regressionen für N=1 oder Rendering.

## Technische Details

- **Datei neu:** `supabase/functions/_shared/resolveIdentityViaRekognition.ts`
- **Datei geändert:** `supabase/functions/compose-video-clips/index.ts` (Guard + plate_identity schreiben)
- **Datei neu:** `src/components/scene/FaceMapReviewDialog.tsx`
- **Datei geändert:** `src/components/scene/SceneClipProgress.tsx` (Trigger für Dialog)
- **DB Migration:** enum `clip_status` um `awaiting_manual_face_map` erweitern falls nicht vorhanden.
- **One-Shot:** UPDATE auf Szene `ef5bff66…`.
