## Was wirklich passiert ist

Die Szene `9c546015` hat einen **gültigen Anchor + Clip** (sichtbar im Screenshot, 3 Gesichter). Trotzdem wurde sie mit `source_clip_missing_speakers: 0/2 faces` abgebrochen. Edge-Function-Log:

```
faceMap { faces: 0, source: "heuristic-fallback", anchor: false, clip: true }
```

Zwei Bugs in `compose-twoshot-lipsync` → `detectFacesInMaster`:

### Bug 1 — Falsche Anchor-Spalte gelesen
`anchorUrlForDetect = scene.lock_reference_url` — aber der Composer schreibt den Anchor in `reference_image_url`. `lock_reference_url` ist im Composer-Flow IMMER `NULL`, also wird der Image-Pass **komplett übersprungen**.

### Bug 2 — MP4 als `image_url` an Gemini geschickt
Weil Bug 1 den Anchor überspringt, fällt der Code auf den Clip zurück und sendet die `.mp4`-URL direkt als `image_url` an die Lovable-AI-Gateway. Gemini Vision dort akzeptiert **nur Bilder** (jpg/png/webp) — kein Video-Decoding aus MP4-URLs. Antwort = 0 Gesichter → falscher "Source-Clip missing speakers"-Fehlschlag, obwohl der Clip in Wirklichkeit alle Sprecher zeigt.

## Plan

### 1. `detectFacesInMaster` auf die richtige Anchor-Spalte mappen
In `compose-twoshot-lipsync/index.ts` (Zeile 688):
```ts
const anchorUrlForDetect =
  (scene as any).reference_image_url ||
  (scene as any).lock_reference_url ||
  null;
```
Damit nutzt der Audit den tatsächlich vorhandenen Anchor (Standbild = zuverlässigste Quelle) und Bug 1 ist weg.

### 2. MP4-Fallback durch echte First-Frame-Extraktion ersetzen
Im `_shared/face-count.ts` und `askGeminiForFaces`: wenn `kind === 'video'`, **nicht** die MP4-URL an `image_url` durchreichen. Stattdessen:
- Neuer Helper `extractFirstFrameToStorage(videoUrl)` in `_shared/extract-first-frame.ts` ruft die existierende `extract-video-frame`-Pipeline auf (gleicher Pattern wie Continuity-Guardian-Frame-Extraktion). Speichert das Frame als PNG im `composer-frames`-Bucket, gibt die Public-URL zurück.
- Diese PNG-URL wird dann an Gemini `image_url` geschickt → funktioniert garantiert.
- Cache: das extrahierte Frame in `audio_plan.twoshot.faceMap.frameUrl` ablegen, damit Retries nichts neu extrahieren.

Falls die Frame-Extraktion fehlschlägt: Function gibt `null` zurück, Caller fällt auf heuristische Drittel zurück (alte Behavior) — aber **kein** Fail-Loudly mehr, wenn der Anchor schon ≥2 Gesichter geliefert hat.

### 3. Fail-Loudly nur bei wirklich fehlenden Gesichtern
Im Block (Zeile 717): die Bedingung greift schon zu früh, sobald irgendeine Detection unklar ist. Logik anpassen:
- Wenn der **Anchor** ≥2 Gesichter zeigt → `hasTwoRealFaces = true`, weiter mit Multi-Pass (auch wenn Clip-Frame nicht auswertbar war).
- Nur wenn Anchor UND Clip-Frame jeweils <2 Gesichter haben → Refund + Fail mit klarer Message.
- Wenn Gemini gar nicht erreichbar war (beide Quellen null) → heuristisches Targeting versuchen statt sofort zu failen.

### 4. Symmetrische Korrektur in `compose-video-clips`
Der Pre-Flight-Audit ruft `countFacesInImage` mit `kind:'image'` auf der frisch komponierten Anchor-URL auf — dort gibt es das Problem nicht. **Keine Änderung nötig.** Nur dokumentieren, dass Video-Input für `countFacesInImage` weiterhin verboten ist, bis Frame-Extraktion vorgeschaltet ist.

### 5. Memory-Update
`mem://architecture/lipsync/sync-so-pro-model-policy`:
- Neue Regel: "Anchor-Quelle ist `reference_image_url` (mit Fallback auf `lock_reference_url`). `lock_reference_url` ist im Composer fast immer NULL."
- Neue Regel: "Gemini `image_url` darf NIE eine MP4-URL bekommen — immer vorher Frame-Extraktion."

### 6. Aktuelle Szene reparieren
`9c546015-21f1-4715-b484-ffe53f23c36f`:
```sql
UPDATE composer_scenes
SET lip_sync_status='pending', twoshot_stage=NULL, clip_error=NULL,
    replicate_prediction_id=NULL
WHERE id='9c546015-21f1-4715-b484-ffe53f23c36f';
```
Anchor + Clip bleiben — sie sind in Ordnung. Der Auto-Trigger nimmt die Szene dann mit dem gefixten Audit-Pfad neu auf.

## Akzeptanzkriterien
- Szene `9c546015` läuft nach Reset durch Multi-Pass-Lipsync ohne erneutes Clip-Re-Roll.
- Edge-Log zeigt `faceMap { source: 'anchor', faces: ≥2 }` statt `heuristic-fallback`.
- Künftige Two-Shot-Szenen mit gültigem Anchor werden nie wieder fälschlich wegen "0 faces in MP4" abgebrochen.

## Geänderte Dateien
- `supabase/functions/compose-twoshot-lipsync/index.ts` — Anchor-Spalte korrigieren + Fail-Logik weichzeichnen
- `supabase/functions/_shared/face-count.ts` — Video-Input klar verbieten, Helper-Dokstring
- `supabase/functions/_shared/extract-first-frame.ts` — neu (optional, für robustere Clip-Fallback-Detection)
- Migration: Reset der fehlgeschlagenen Szene
- `mem://architecture/lipsync/sync-so-pro-model-policy` — neue Anchor- + Frame-Extract-Regel