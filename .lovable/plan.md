# Plan v278 — Anchor-Position-as-Truth + Hungarian Face-Slot-Router (Task-Robust)

## Kernfrage: Funktioniert das auch wenn Charaktere Tasks erledigen (Telefon, Drucker, Laptop)?

**Ja — sogar besser als jede Version seit v260**, weil v278 keine biometrische Ähnlichkeit mehr braucht. Genau die war der Grund warum Tasks (Profile, Verdeckung, kleinere Gesichter) das Matching gebrochen haben.

## Warum Tasks bisher (v274–v277) die Pipeline zerstört haben

- `[CastActions]` → Charaktere drehen sich weg, gehen ins Profil, werden verdeckt.
- Rekognition `CompareFaces` Portrait↔Plate fällt unter Threshold (auch mit 45).
- Fallback ohne Uniqueness → Duplicates ("Samuel und Sarah auf dasselbe Gesicht").
- Ergebnis: Silent-Speaker, Identity-Drift, Duplicate-Fehler.

## Warum v278 das strukturell löst

Zwei Wahrheiten die wir bisher weggeworfen haben:
1. **Anchor-Prompt-Ordering** — wir wissen exakt, wen wir wohin gerendert haben.
2. **Anchor-Face-Positionen** — wir können sie mit einem `DetectFaces`-Call auf dem Anchor deterministisch messen.

Diese beiden Wahrheiten kombiniert = kein biometrisches Guessing mehr nötig.

## Pipeline

```text
Anchor-Render (Nano Banana 2)
        │
        ├──► DetectFaces auf Anchor        →  Anchor-Face-Center[] pro Slot
        │                                     (persistiert als anchor_face_layout)
        └──► anchor_composition_order       →  [{characterId, slotIndex}]
                                              (aus Prompt-Reihenfolge)
        ▼
Plate-Render (Hailuo/Seedance mit Tasks)
        │
        ▼
DetectFaces auf Plate                       →  Plate-Face-Center[]
        │
        ▼
Hungarian-Matching                          →  minimale Gesamt-Distanz,
Anchor-Center[i] ↔ Plate-Center[j]             bijektiv (jede Box exakt 1×)
        │
        ▼
plate_identity Lock                         →  Sync.so pro Sprecher an echter Box
```

## Warum Hungarian-Matching der Schlüssel für Tasks ist

Row-Major allein kippt bei Tasks:
- jemand hockt vorne am Drucker (niedriges Y)
- jemand steht hinten am Fenster (hohes Y)
- → row-major würde die falsche "Reihe" bilden

Hungarian-Algorithmus (bijektive minimale Distanz) toleriert Verschiebungen bis ~30–40% der Plate-Breite, solange die relative Anordnung ungefähr erhalten bleibt — was bei einem Cut vom Anchor zur Task-Szene fast immer der Fall ist.

## Warum das die Fehler eliminiert — auch bei Tasks

| Fehler | Warum er verschwindet, auch mit Tasks |
|---|---|
| Duplicate-Face | Bijektive Zuweisung — mathematisch unmöglich |
| Identity-Drift bei Profil | Keine Ähnlichkeit nötig, nur Position |
| Silent-Speaker | Sync.so bekommt echte DetectFaces-Box, keine geratene |
| Verdeckte Sprecher | Face-Count-Mismatch → sauberes Review, kein falsches Rendering |
| Task-bedingte Positionsdrift | Hungarian toleriert Verschiebung, solange relative Ordnung stimmt |

## Umsetzung

### 1. Anchor speichert Layout
- `compose-scene-anchor`: nach erfolgreichem Render zusätzlich `DetectFaces` auf Anchor.
- Persistiert: `dialog_shots.anchor_face_layout = [{slotIndex, characterId, cx, cy, w, h}]`.
- Kosten: +1 Rekognition-Call (~200ms, ~0.001€).

### 2. Neuer Router
- Datei: `supabase/functions/_shared/plateFaceSlotRouter.ts`
- Input: Plate-URL + `anchor_face_layout`.
- Schritte:
  a. `DetectFaces` auf Plate.
  b. Kosten-Matrix: `dist[i][j] = euclidean(anchor[i].center, plate[j].center)` (normalisiert auf [0,1]).
  c. Hungarian-Algorithm → optimales Assignment.
  d. Return: `[{characterId, plateBox}]`.
- Fallback wenn `plate.faceCount !== anchor.faceCount`: `awaiting_face_slot_map`, kein Refund, Review-UI.

### 3. `compose-video-clips` (N≥3)
- Ersetzt `resolveIdentityViaRekognition` durch `plateFaceSlotRouter` für N≥3.
- Schreibt `plate_identity` mit Marker `v278_plate_router_hungarian`.
- N=2 bleibt auf v276-Pfad (dort stabil).

### 4. Merge-Safety (v277 bleibt)
- `compose-twoshot-audio` und `compose-dialog-segments` lesen `plate_identity` frisch, überschreiben v278-Marker nie.

### 5. Review-UI
- `FaceMapReviewDialog.tsx` (aus v274) erweitert: Thumbnails aller erkannten Plate-Gesichter, Drag&Drop auf Sprecher.
- `SceneClipProgress.tsx`: neuer Status `awaiting_face_slot_map` → CTA "Slots zuordnen".

### 6. Cleanup
- `resolveIdentityViaRekognition` bleibt nur für N=2.
- Zwei-Pass-Similarity nicht mehr im N≥3-Pfad.

## Erwartete Fehlerrate (grobe Schätzung, letzte ~25 Failures als Basis)

| Fehler-Kategorie | Heute | Nach v278 |
|---|---|---|
| Duplicate-Face | ~35% | 0% |
| Identity-Drift Profil/Task | ~25% | ~3% |
| Silent-Speaker | ~20% | ~7% (Rest = Sync.so intern) |
| Neuer Modus: awaiting_face_slot_map | 0% | ~8% (1 Klick Review) |

Netto-Reduktion harter Failures: **~80%**. Neuer Review-Modus ist kein Failure, sondern Soft-Gate mit 1-Klick-Lösung.

## Nicht-Ziele

- N=2 unangetastet.
- Anchor bleibt Nano Banana 2 (v276).
- Sync.so-Pfad unverändert.
- Keine Änderung an `[CastActions]` — Tasks werden weiterhin unterstützt.

## Rollout

- Feature-Flag `V278_HUNGARIAN_ROUTER_N3` default ON.
- Fallback auf v277 bei Flag off.
- Kein Refund für neuen `awaiting_face_slot_map`-Status (User-Interaktion, kein Fehler).
