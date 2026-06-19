# Plan: Group-Plate Anti-Split-Screen Fix

## Symptom
Bei 4-Sprecher-Hook ist der gerenderte Hailuo-Plate ein **echter 4-Panel Split-Screen** (vier vertikale Streifen, jede Person isoliert). Folge:

- Sync.so Face-Gate blockiert Pass 2 (Kailee) und Pass 3 (Sarah) mit `plate_target_face_missing` — die Gesichter sind zwar im Bild, aber an festen Spalten-Positionen die nicht zu den per-Speaker-Koordinaten passen.
- Pass 1 fällt mit `syncso_segments_FAILED: generation_unknown_error` (Sync.so kann die Quad-Split-Composition nicht parsen).
- Folge-Pässe werden mit `canceled_by_scene_failure` abgebrochen.

## Root Cause
`neutralTwoShotPrompt()` in `supabase/functions/compose-video-clips/index.ts` (Z. 616–639) baut für n≥3 diesen Positiv-Prompt:

> *"arranged in a single horizontal line, left-to-right, with **equal screen share** and **clear gaps between them** (no overlap, no person standing in front of another)"*

Hailuo (und Nano Banana 2 als Anchor-Composer) interpretieren `equal screen share` + `clear gaps` + `no overlap` zunehmend **wörtlich als Split-Screen-Layout** statt als ein gemeinsames Group-Foto. Das negativ-Prompt-Block `CINEMATIC_SYNC_SILENT_MASTER_NEGATIVE` (Z. 326–349) enthält nur `picture-in-picture`, aber keine expliziten Sperren für Split-Screen / Panel-Grid / Photo-Collage.

## Lösung (4 Stufen)

### 1. Group-Framing-Prompt umschreiben (n ≥ 3)
`supabase/functions/compose-video-clips/index.ts` — `neutralTwoShotPrompt`, n≥3-Branch:

Neue Formulierung betont **einen gemeinsamen physischen Raum, eine durchgehende Kamera, ein Take**:

```
all standing together in the same physical room as a natural group, captured in
one continuous cinematic frame by a single locked camera in one take.
Wide medium group shot, ensemble composition: every person occupies real
shared 3D space (overlapping depth planes, natural personal distance ≈
shoulder-width, slight depth stagger so nobody is perfectly side-by-side).
Each face stays clearly visible, front- or three-quarter-facing, mouth and
jaw unobstructed. Identical ambient lighting across the whole room.
```

Entfernt: `single horizontal line`, `equal screen share`, `clear gaps between them`. Diese drei Phrasen sind die direkten Trigger für das Split-Screen-Misinterpretation.

### 2. Negative-Prompt härten
Im `CINEMATIC_SYNC_SILENT_MASTER_NEGATIVE` (Z. 349) anhängen:

```
, split screen, split-screen composition, split-frame, multi-panel layout,
panel grid, photo grid, brady bunch grid, photo collage, composite of
separate portraits, isolated character cutouts, vertical divider lines,
visible seams between people, four-up grid, two-up grid, side-by-side panels,
each person in their own frame, individual portrait panels
```

Diese Begriffe werden zusätzlich an `negativeFor()` für i2v-Calls geroutet (bestehender Pfad — keine Strukturänderung).

### 3. ANCHOR_AUDIT_VERSION 8 → 9
`supabase/functions/compose-video-clips/index.ts` Z. 37:

```ts
const ANCHOR_AUDIT_VERSION = 9;
```

Bewirkt dass alle bereits gecachten Quad-Split-Plates beim nächsten Cinematic-Sync-Render automatisch verworfen und mit dem neuen Prompt neu komponiert werden — ohne dass User manuell "Neu rendern" klicken müssen.

### 4. Plate-Quality-Gate erweitern (optionaler Split-Screen-Detector)
`supabase/functions/compose-dialog-segments/index.ts` v117/v119 Plate-Quality-Gate (Z. 1291–1376):

Wenn bei n≥3 alle erkannten Face-Boxes
- **gleiche y-Achse** haben (Center-y ± 5 % der Frame-Höhe) UND
- **gleichmäßig in x verteilt** sind (Abstände untereinander ± 8 % gleich) UND
- **Box-Höhen ± 10 % identisch** sind

→ als `split_screen_layout` klassifizieren und mit eigenem `clip_error` markieren:

> *"Plate wurde als Split-Screen-Layout erkannt — Sync.so kann Einzel-Panels nicht lipsyncen. Bitte Szene neu rendern (alle Personen müssen im selben Raum stehen, nicht in getrennten Panels)."*

Credits werden über den bestehenden Refund-Pfad zurückerstattet (identisch zu `plate_faces_missing`).

## Files
- `supabase/functions/compose-video-clips/index.ts` — Prompt + Negative + Audit-Version
- `supabase/functions/compose-dialog-segments/index.ts` — Split-Screen-Heuristik im Plate-Quality-Gate
- `mem/architecture/lipsync/anti-split-screen-group-plate-v9.md` — neue Memory
- `mem/index.md` — Eintrag hinzufügen

## Outside scope
- Sync.so `generation_unknown_error` selbst — das ist ein nachgelagertes Symptom, das mit korrektem Group-Plate verschwindet. Kein eigener Retry-Pfad nötig.
- N-Slot Face-Map Architektur — bleibt unverändert; die Koordinaten waren korrekt, nur der Plate war falsch komponiert.
- FROZEN-INVARIANTS (I.4) — `LOCKED static camera` und alle Framing-Change-Keywords bleiben verbatim erhalten.

## Verification
1. Edge-Functions deployen (`compose-video-clips`, `compose-dialog-segments`).
2. User klickt "Sauber neu starten" auf der Lipsync-Bar → Plate wird wegen Audit v9 neu komponiert.
3. Erwarten: Group-Shot im gemeinsamen Raum (kein Split), Face-Gate findet alle 4 Gesichter, Sync.so läuft durch.
4. Falls Hailuo trotzdem splittet: Split-Screen-Detector blockt vor Sync.so-Dispatch mit klarer Fehlermeldung statt `generation_unknown_error`.
