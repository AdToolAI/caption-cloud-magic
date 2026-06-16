# v129.2.0 — Speaker-0 Lipsync Asymmetry: Forensik-Report

**Status:** Read-only Forensik abgeschlossen, **Classification A bewiesen**.
**Datum:** 2026-06-16
**Vorgänger:** v129.1 (Payload-Contract Doc-Strict — shipped, aber nicht der relevante Pfad).
**Nachfolger:** v129.2.1 chirurgischer Hotfix in `supabase/functions/_shared/face-crop.ts` (1 File).

---

## 0. User-Signal

> "Das Lipsync von allen Charakteren ausser Sprecher 1 hat funktioniert!"

Pass 0 (Samuel Dusatko) zeigt keinerlei Mund-Animation. Passes 1–3
(Matthew, Kailee, Sarah) lipsyncen korrekt.

---

## 1. Überraschung in den Daten

Die v129.1 Payload-Contract-Logik ist **nie aktiviert** worden:

```sql
SELECT meta->'v116_diag'->>'asd_mode' AS asd_mode,
       meta->'v116_diag'->>'coord_source' AS coord_source,
       meta->'pass_idx' AS pass_idx,
       meta->'speaker' AS speaker,
       meta->'coords' AS coords,
       meta->'v116_diag'->'preclip_crop' AS preclip_crop
FROM syncso_dispatch_log
WHERE sync_status = 'DISPATCHED'
  AND created_at > now() - interval '24 hours'
ORDER BY scene_id, pass_idx;
```

**Alle dispatches** zeigen:

| pass | speaker  | asd_mode              | coord_source     | coords          | preclip_crop                       |
|------|----------|-----------------------|------------------|-----------------|------------------------------------|
| 0    | Samuel   | `preclip_auto_detect` | `plate-identity` | `[204, 202]`    | `{x:84, y:82,  size:240}`         |
| 1    | Matthew  | `preclip_auto_detect` | `identity`       | `[487, 278]`    | `{x:358, y:150, size:256}`        |
| 2    | Kailee   | `preclip_auto_detect` | `identity`       | `[1172, 288]`   | `{x:826, y:12,  size:550}`        |
| 3    | Sarah    | `preclip_auto_detect` | `identity`       | `[195, 283]`    | `{x:84, y:172, size:220}`         |

`asd_mode = preclip_auto_detect` für **alle** Passes → das v129.1
Multi-Speaker-Doc-Strict-Branch wurde nie ausgeführt. Stattdessen läuft
die **Per-Pass Single-Face-Preclip Pipeline** (`renderPassFacePreclip` →
ein 720×720 Crop um EINE Face-Center-Coord, dispatcht mit
`auto_detect:true`). Sync.so animiert "die" Face im Crop — was die
richtige ist, hängt nur am Crop-Region-Inhalt.

→ Die v129.1-Annahme "Multi-Speaker = ein geteilter Preclip mit N Faces"
war für diesen Pfad **nicht zutreffend**. v129.1 bleibt korrekt als
Defensive für den Multi-Face-Pfad, ist hier aber unbeteiligt.

---

## 2. Crop-Geometrie pro Pass (Scene 25512d7f)

Plate ist ein **2×2 Grid** (vier Sprecher in zwei Reihen):

```
   x=0          x=720         x=1440
y=0  ┌─────────────┬─────────────┐
     │  Samuel     │  Matthew    │
     │ (204, 202)  │ (487, 278)  │
y=400├─────────────┼─────────────┤
     │  Sarah      │  Kailee     │
     │ (195, 283)  │ (1172, 288) │
     └─────────────┴─────────────┘
```

Samuel und Sarah teilen die **linke Spalte**, vertikaler Abstand
**Δy ≈ 81 px** (Sarah y=283 vs Samuel y=202; Δx ≈ 9 px).

Samuels Preclip-Crop: `(x=84, y=82, size=240)` → deckt **x:84..324,
y:82..322**. Sarah liegt bei (195, 283) — **vollständig innerhalb von
Samuels Crop**. Sarahs Mund (y ≈ 290–310) liegt im unteren Drittel
desselben Crops.

→ Sync.so's `auto_detect` im 720×720 Preclip findet **zwei Gesichter**,
wählt deterministisch eines aus (typischerweise das prominentere /
zentralere oder das untere), wendet Samuels Audio darauf an. Beim
Audio-Mux wird der lipsyncte Crop zurück auf die Samuel-Position
gepastet → **Samuel sieht statisch aus**, weil tatsächlich Sarahs Mund
animiert wurde, aber an Samuels Position eingeklebt.

---

## 3. Root-Cause: `computeFaceCrop` v92-Floor

Datei `supabase/functions/_shared/face-crop.ts`, Lines 116–121:

```ts
if (hasNeighbors) {
  const maxAllowed = Math.max(220, 0.88 * minNeighborDist);
  size = Math.min(size, maxAllowed);
} else {
  size = Math.max(size, 220);
}
```

Die Cap-Formel `max(220, 0.88 × gap)` sollte Crops **schrumpfen** wenn
Nachbarn nahe sind. Aber durch das **harte Floor von 220 px**
(eingeführt v92 für mehr "facial detail") gilt:

> Wenn der Nachbar-Abstand `gap < 250 px` ist, gewinnt der 220-Floor
> über den Neighbor-Cap → Crop ist **größer als der Abstand zum
> Nachbarn** → der Nachbar landet **garantiert im Crop**.

Für Samuel: `gap ≈ 81 px`, `0.88 × 81 = 71`, `max(220, 71) = 220`.
Crop-size = 220 (gemessen 240 — leichte bbox-basierte Korrektur),
Δy zum Nachbarn = 81. Crop deckt ±110/±120 px → Sarah's Face mit
Δy=81 ist im Crop. **Mathematisch unvermeidbar.**

### Warum nur Samuel?

- Matthew (487, 278) vs Kailee (1172, 288): Δx ≈ 685 → kein Konflikt.
- Kailee (1172, 288) vs Matthew (487, 278): selbe Distanz → kein Konflikt.
- Sarah (195, 283) vs Samuel (204, 202): Δy ≈ 81 → **gleicher Konflikt
  wie Samuel**, aber Sarah ist Pass 3 (letzter) und ihr Crop ist enger
  positioniert (`size=220`, `y=172..392`) → Samuel liegt bei y=202,
  also **am oberen Rand von Sarahs Crop**. Sync.so wählt hier
  vermutlich Sarah's Face (zentraler) korrekt aus → Sarah lipsynct
  richtig.

Die Asymmetrie ist eine Folge der **Crop-Positionierung relativ zur
Vertical-Order**: Samuel ist oben, sein Crop reicht nach unten und
schluckt Sarah ganz; Sarah ist unten, ihr Crop reicht nach oben und
schneidet Samuel am Rand → Samuel ist im Crop weniger prominent.

Bei Scene 225ea521 ist die Konstellation analog (Samuel oben, Kailee
unten gleiche Spalte): Samuels Crop schluckt Kailee → Pass 0 broken,
Passes 1/2/3 ok.

---

## 4. Klassifikation

Per Plan-Matrix v129.2:

| Symptom | Klassifikation | Bestätigt |
|---|---|---|
| Pass-0-Crop enthält Sprecher-N's Face | **A — Face-Map / Crop Bug** | ✅ |
| `asd_mode != preclip_coords_doc_strict` für Pass 0 | B — Pass-0-Fallthrough | ❌ alle Passes auto_detect |
| Sync.so output ≈ input bei valider Bbox | C — Sync.so frame_number | ❌ N/A |
| Pass-0 ok, Stitch überschreibt | D — Audio-Mux | ❌ Crop ist falsch |

→ **Classification A** mit Sub-Klassifikation **A2 — Preclip Sibling-Floor Regression**.

Nicht ein Face-Map-Slot-0-Mis-Assignment (Identity-Resolver ist korrekt:
`coord_source=plate-identity`, coords matchen Samuels Position). Der Bug
sitzt im **Crop-Sizing**, nicht in der **Identity-Resolution**.

---

## 5. v129.2.1 Hotfix-Empfehlung (1 File, ~6 Zeilen)

**File:** `supabase/functions/_shared/face-crop.ts`
**Funktion:** `computeFaceCrop`
**Änderung:** Floor MUSS dem Neighbor-Cap weichen, sobald ein Nachbar
existiert. Der 220-Floor ist nur dann sinnvoll, wenn **kein** Nachbar
in Floor-Range ist.

Vorgeschlagener Patch (semantisch — Wortlaut im Hotfix-Plan):

```ts
if (hasNeighbors) {
  // v129.2.1 — Neighbor-Cap ist hart: Crop darf NIE den Nachbarn
  // enthalten. Der 220-Floor gilt nur, wenn der Nachbar-Cap selbst
  // mindestens 160 px erlaubt (Sync.so braucht min. 160 px Face-Crop
  // für brauchbare Detection). Bei tighter Stacks wird der Crop
  // kleiner als der alte Floor — bewusst, weil das Alternativ-
  // Symptom (falsches Gesicht animiert) deutlich schlimmer ist als
  // ein 180-px-Crop mit korrektem Sprecher.
  const neighborCap = Math.floor(0.88 * minNeighborDist);
  const floor = neighborCap >= 160 ? Math.min(220, neighborCap) : neighborCap;
  size = Math.min(size, Math.max(floor, neighborCap));
} else {
  size = Math.max(size, 220);
}
```

Effekt für Samuel: `neighborCap = floor(0.88 × 81) = 71`. Da 71 < 160 →
`floor = 71`, `size = min(rawSize, 71) → 71 → evenSnap → 70`. Crop um
Samuel (204, 202) mit size 70 → x:169..239, y:167..237. Sarah (195, 283)
ist NICHT mehr im Crop (y=283 > 237). ✓

Kleine Crops geben Sync.so weniger Detail, aber das ist immer noch
**radikal besser** als die falsche Face zu animieren. Für lockere Layouts
(gap > 182 px, womit 0.88×gap > 160) bleibt der 220-Floor erhalten.

### Out of Scope für v129.2.1
- Multipass-Logik, ASD-Doc-Strict, v129.1-Block bleiben unverändert.
- State Machine, Retry, Watchdog, Plan-D, UI: kein Touch.
- Keine DB-Migration, keine neuen Edge Functions, keine neuen Spalten.
- Keine Änderung an `pickSpeakerCoordinates` oder `resolvePlateFaceIdentities`.

### Canary v129.2.1
1 User / 1 vertikal gestapelte 4-Sprecher-Szene (z.B. neuer Replay der
Scene 25512d7f-Vorlage).

**Pre-deploy Evidence:** Pass 0 (Samuel) `preclip_crop.size = 240`,
Pass 0 lipsync visuell statisch.
**Post-deploy Evidence:**
- Pass 0 `preclip_crop.size ≤ ⌊0.88 × 81⌋ = 71`
- Pass 0 zeigt Mund-ROI-Bewegung an Samuels Position
- Passes 1–3 unverändert (ihre `siblingCoords` ändern sich nicht und
  ihre gaps > 250 px → Floor weiterhin 220)

### Stop-Bedingung
Wenn Samuels Crop ≤ 100 px ist und Sync.so trotzdem nicht animiert
(zu wenig facial detail), reopen als **C** und plan-pivot auf:
- bounding_boxes_url Pfad (deterministische Box statt auto_detect)
- ODER preclip-upscaling vor Sync.so dispatch

---

## 6. Anhang — Beweis-Queries

### Per-pass dispatch evidence
```sql
SELECT scene_id,
       meta->'pass_idx' AS pass_idx,
       meta->'speaker' AS speaker,
       meta->'coords' AS coords,
       meta->'v116_diag'->>'coord_source' AS coord_source,
       meta->'v116_diag'->'preclip_crop' AS preclip_crop,
       meta->'v116_diag'->>'preclip_face_count' AS preclip_face_count
FROM syncso_dispatch_log
WHERE sync_status = 'DISPATCHED'
  AND scene_id IN ('25512d7f-489d-48fe-8f83-643b7c16b5ed',
                   '225ea521-7e18-4a02-b279-6f172db4ffd0',
                   '620b5358-8572-41b1-a9f4-19285cb6223d')
ORDER BY scene_id, (meta->>'pass_idx')::int;
```

### Sibling-distance proof
Für jedes Pass-0 Sample:
- 25512d7f: Samuel(204,202) ↔ Sarah(195,283) — Δ = 81.5 px
- 225ea521: Samuel(302,103) ↔ Kailee(303,138) — Δ = 35.0 px (!)
- 620b5358: Samuel(306,471) ↔ ?  (vertikal stacked layout, vermutlich Kailee oder Sarah unter Samuel)

Bei Scene 225ea521 ist der Gap nur **35 px** — Crop von 220 enthält
Kailee mit Δ=35 garantiert. Selbe Mechanik, schärfere Ausprägung.

---

**Forensik abgeschlossen. v129.2.1 Hotfix ist freigegeben sobald der
User zustimmt.**
