## Symptom
4-Sprecher-Continuous-Szene (Screenshot): Sprecher 1 & 2 (linke Hälfte) bewegen Lippen korrekt, Sprecher 3 & 4 (rechte Hälfte) bleiben stumm. Alle Passes werden vermutlich als `done` gemeldet — sonst hätte die Szene einen Refund ausgelöst.

## Verdacht (nach Memory-Historie v88 / v99 / v122 / v125 / v204)

Der Fehler liegt fast sicher **nicht** an fehlender Voice/UUID (das war das vorherige Thema), sondern am Preclip-/Mux-Pfad für Speaker 3 & 4:

1. **Preclip-Drift auf Nachbarn (v122-Muster)** — `bboxForCrop` für Speaker 3/4 landet auf Speaker 1/2, Face-Gate akzeptiert (1 Gesicht sichtbar), Sync.so animiert das falsche Gesicht.
2. **Edge-Speaker "silent no-op" (v88/v99-Muster)** — Speaker 3/4 sitzen im äußeren Viertel des 4er-Line-Ups; v88-Skip wurde in v125 deaktiviert. Preclip liegt am Plate-Rand, `auto_detect` findet kein Ziel, Sync.so gibt Preclip 1:1 zurück → geschlossener Mund.
3. **Mux `preclip_crop` enthält Coords des Nachbarn** — v122 defense-in-depth im Mux ignoriert dann das Overlay und fällt auf faceMask zurück, aber die faceMask sitzt auf den falschen Koordinaten.

Alle drei Muster produzieren einen erfolgreich gerenderten Clip mit stummen Mündern für genau die Speaker deren Coords im äußeren Bereich liegen — **exakt Speaker 3 & 4**.

## Plan

### Phase 1 — Diagnose (read-only, keine Codeänderung)

1. Aus dem UI die `scene_id` der aktuellen Szene erfragen (oder aus letztem Composer-Run holen).
2. `composer_scenes.dialog_shots.passes[]` inspizieren für jeden der 4 Speaker:
   - `coords` vs. `preclip_crop.{x,y,size}` — landet Coord im inner-70%-Kern des Crops?
   - `preclip_url` vorhanden? Frame-Diff (später) oder Sichtcheck: bewegt sich der Mund im Preclip selbst?
   - `variant` / `sync_options.active_speaker_detection` — `bbox-url-pro` oder `preclip+auto_detect`?
   - Sync.so `provider_status` / `error_type` pro Pass.
3. Edge-function-Logs für `compose-dialog-segments` und `render-sync-segments-audio-mux` filtern nach der scene_id: `v122_bbox_drift_rejected`, `v88_edge_speaker_skip_preclip`, `v99_preclip_bbox`, `coordsMatch=false`, `provider_unknown_error`.
4. Ergebnis: eindeutige Zuordnung zu einem der 3 Muster oben.

### Phase 2 — Gezielter Fix (nach Diagnose)

Je nach Ergebnis genau **einer** dieser Patches, nicht alle:

**A) Wenn Preclip-Drift (Muster 1):** v122-Guard verschärfen — inner-Anteil von 70 % → 60 % senken und den Rejection-Retry auch dann auslösen, wenn `bboxForCrop` aus `speakerPlateBboxes` (nicht faceMap) kam. Aktuell verlässt sich der Guard darauf, dass `bboxForCrop` überhaupt gesetzt war; für plate-identity-basierte Bboxes ist die Erkennung schwächer.

**B) Wenn Edge-Silent-No-op (Muster 2):** v88 nicht global reaktivieren (das brach v125-Szene), sondern **konditional**: Edge-Speaker mit v161-Preclip zusätzlich mit v99-Explicit-Bbox dispatchen (`auto_detect:false`, static `bounding_boxes` in Crop-lokalem Space). Dieser Pfad existiert bereits — sicherstellen dass er für alle Edge-Speaker greift, nicht nur wenn eine bestimmte Bedingung erfüllt ist.

**C) Wenn Mux-Coords-Mismatch (Muster 3):** in `render-sync-segments-audio-mux` die faceMask-Fallback-Position aus `pass.coords` (Plate-Space) statt aus `preclip_crop.center` ableiten, wenn v122-Guard im Mux gefeuert hat.

### Phase 3 — Verifikation

1. Szene reset via `useResetLipSync` und Neu-Rendern.
2. Frame-Diff-Prüfung: `ffmpeg -filter:v "select='eq(n,0)+eq(n,60)+eq(n,120)'"` auf Mundregion jedes Speakers — Mean-Abs-Diff ≥ 4 = animiert, < 2 = still.
3. Sichtcheck der finalen Szene: alle 4 Münder synchron.

## Was ich vom User brauche

Kurz eines von beiden bestätigen, dann starte ich Phase 1:

- **Option A:** Ich habe die aktuellste `scene_id` (letzter Composer-Run) — sofort Diagnose starten.
- **Option B:** User teilt die scene_id oder den letzten Composer-Screenshot mit sichtbarem Log/URL.

Kein Preise-/Wiring-/UI-Change in diesem Ticket — reiner Lip-Sync-Pipeline-Fix.
