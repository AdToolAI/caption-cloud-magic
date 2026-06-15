# v123 — Stale-Preclip Invalidation on Coords Refresh

## Symptom
Im Multi-Speaker-Dialog (4 Sprecher) bewegt nur Sprecher 4 die Lippen. Bei Sprecher 1–3 erscheint ein verpixeltes Overlay (z. B. Pflanze) — kein animierter Mund.

## Root Cause (verifiziert an Scene `785168d1…`)
Im Edge-Log sieht man:

```text
ADVANCE COORDS REFRESH pass=0 speaker=Samuel old=[618,377] new=[839,202] source=identity
ADVANCE COORDS REFRESH pass=3 speaker=Sarah  old=[1045,375] new=[204,232] source=identity
```

In der DB (`dialog_shots.passes`):

| Pass | persisted coords | preclip_crop center | passt? |
|------|------------------|--------------------|--------|
| 0    | (618, 377)       | (618, 376)          | passt zu **alten** coords, neue coords (839,202) liegen außerhalb |
| 1    | (536, 200)       | (758, 372)          | drift ~220 px — Crop liegt auf Hintergrund (Pflanze) |
| 2    | (1173, 235)      | (902, 374)          | drift ~270 px — gleiches Muster |
| 3    | (204, 232)       | (204, 232)          | korrekt (frisch gerendert nach Refresh) |

`v87 — ADVANCE COORDS REFRESH` (compose-dialog-segments, Z. 1976–1997) aktualisiert nur `p.coords`, **invalidiert aber nicht** den bereits gerenderten Preclip (`preclip_url`, `preclip_crop`, `preclip_render_id`, `output_url`, `status`). Folge:
1. Pass läuft mit alten Koordinaten durch, Preclip wird gerendert + als `status='done'` persistiert.
2. Auf der nächsten Dispatcher-Iteration werden coords per `v87` korrigiert.
3. Das bestehende Preclip-Asset bleibt gespeichert — Sync.so animiert weiter den falschen Ausschnitt, Audio-Mux klebt den animierten Crop wieder auf die alte (jetzt falsche) Position → "Pflanzen-Overlay".

Zusätzlich greift `v122 coordsInsideCrop` nur, wenn `bboxForCrop` gesetzt ist (`&& bboxForCrop`, Z. 2551). Wenn der stale Crop coords-zentriert war (Pass 0) ODER coords sich nach dem Preclip-Bake noch ändern, läuft der Re-Render-Guard nie.

## Fix v123

### 1. `compose-dialog-segments/index.ts` (~Z. 1976–1997)
Im v87-Refresh-Block: wenn sich `coords` für einen Pass effektiv ändert, vor dem `console.log` zusätzlich:

```ts
if (changed) {
  // Stale-Preclip invalidieren — alle Felder, die mit den alten coords
  // gebacken wurden, müssen weg, damit renderPassFacePreclip neu rendert.
  (p as any).preclip_url = null;
  (p as any).preclip_crop = null;
  (p as any).preclip_render_id = null;
  (p as any).preclip_bbox_drift_rejected = false;
  (p as any).preclip_error = null;
  (p as any).preclip_face_count = null;
  // Wenn der Pass schon „done" war, zurücksetzen, damit der Dispatcher
  // ihn neu in die Render-Queue nimmt.
  if (p.status === "done" || p.status === "failed") {
    (p as any).output_url = null;
    (p as any).job_id = null;
    (p as any).last_error = null;
    p.status = "pending";
  }
  p.coords = [freshCoord[0], freshCoord[1]];
  console.log(
    `[compose-dialog-segments] scene=${sceneId} v123 ADVANCE COORDS REFRESH + PRECLIP INVALIDATE ` +
    `pass=${p.idx} speaker=${p.speaker_name} old=${JSON.stringify(oldCoord)} new=${JSON.stringify(p.coords)} source=${freshSource}`,
  );
}
```

### 2. `compose-dialog-segments/index.ts` (~Z. 2551)
v122-Guard härten — `&& bboxForCrop` entfernen, damit jeder Drift ≥ 35 % zu einem Re-Render mit `bbox=null` führt (auch wenn der ursprüngliche Crop bereits coords-zentriert war, kann nach Refresh ein Drift entstehen):

```ts
if (preclip.ok && preclip.crop && !coordsInsideCrop(preclip.crop)) {
  // ...re-render mit bbox=null erzwingt coords-zentrierten Crop
}
```

### 3. Recovery für die laufende Scene
Einmalig SQL: für `785168d1-066e-440f-9a1f-850d29080e55` (und ggf. andere Scenes mit `coords` außerhalb `preclip_crop`) `passes[i].status='pending'`, `preclip_*=null`, `output_url=null` setzen und `lip_sync_status=null`, dann `compose-dialog-segments` per `pass_idx=0` neu antriggern. UI re-rendert automatisch via Webhook.

### 4. Memory + Deploy
- Neue Datei `mem/architecture/lipsync/v123-stale-preclip-invalidation.md` mit Symptom, Root Cause, Fix, „Frozen Invariant: coords-change MUST clear preclip".
- `mem/index.md` Eintrag.
- Deploy `compose-dialog-segments`.

## Out of Scope
- Warum die initialen coords (vor `identity`-Refresh) so weit drifteten — separate Identity/Anchor-Caching-Untersuchung.
- Verbesserung der `speakerPlateBboxes`-Generierung (uniformer Stride statt echter Face-Detection).
- `render-sync-segments-audio-mux` — die v122-„Defense in depth"-Maßnahme bleibt unverändert wirksam für Altscenes.

## Verification
- Edge-Log: bei jedem `v87`-Refresh erscheint zusätzlich `v123 … PRECLIP INVALIDATE`.
- DB-Spot-Check: nach Re-Run von `785168d1…` muss für jeden Pass mit `status='done'` gelten: `|coords − crop_center| ≤ crop.size * 0.35`.
- Visueller Check: alle 4 Sprecher animieren ihre Münder, kein Pflanzen-/Hintergrund-Overlay.
