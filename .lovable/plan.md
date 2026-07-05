## Ausgangslage — was in v169 stimmte und was seither dazukam

**v169-Invarianten (aus deinem Rebuild-Guide, §5 + §10):**
- `active_speaker_detection` ist **entweder** `{ frame_number, coordinates }` **oder** `{ bounding_boxes_url }`.
- **Niemals** `auto_detect: true` für N ≥ 2.
- ASD-Werte kommen aus **einer** Speaker→Face-Quelle, deterministisch, einmal pro Szene berechnet.

**Aktueller Code-Stand (`_shared/asd-strategy.ts`) — v169-konform für Multi-Speaker:**
- Rule 2 → `bounding_boxes_url` (bevorzugt)
- Rule 3 → `frame_number + coordinates` (transformiert oder plate-space)
- Fallback bei fehlenden Daten: `throw "multi_speaker_no_deterministic_asd_available"` → **kein** Auto-Detect. Passt.

**Was seit v169 dazukam und potenziell verhält (v170 – v184):**
- **v183** Anchor-Identity Slot Bridge Rewrites: `plate-face-identity.ts` mit Confidence-Ranking + `v183_unlabeled_fallback` + `v183_identity_collision`.
- **v184** `expectedFaceCount = speakers.length` (entkoppelt vom Portrait-Resolver).
- **v181** N=1 Depicted-Face-Lock (nur N=1 relevant).
- **v170** Variant-ID-Stripping (`outfit:/pose:/wardrobe:/vibe:/prop:/look:`) im Character-ID-Match.

Die 3-Sprecher-Szene aus dem Screenshot (Samuel + Matthew + Sarah) läuft zwingend auf den Multi-Speaker-Pfad. Sync.so hat mit `generation_input_face_selection_invalid` abgelehnt — Sync.so's Detector konnte an der von uns geschickten bbox/coord **kein** Gesicht bestätigen. In v169 hat genau dieselbe Payload-Struktur funktioniert → die Regression liegt **nicht** in der ASD-Strategie, sondern in den **Daten**, die vor der Strategie berechnet werden (Speaker→Face-Mapping oder die AWS-Rekognition-BBox selbst).

Kein Fallback, kein Auto-Detect. Nur Root-Cause.

## Plan — Diagnose zuerst, dann gezielter Fix

### Phase 1 — Forensik (kein Code-Change)

1. **Edge-Function-Logs ziehen** für `compose-dialog-segments` + `sync-so-webhook` der fehlgeschlagenen Szenen (aus dem Screenshot: die drei Szenen im Composer). Suchbegriffe:
   - `v183_plate_identity_mapping`, `v183_identity_collision`, `v183_unlabeled_fallback`
   - `WIRE_PAYLOAD version=v184` → tatsächlich gesendete ASD-Struktur
   - `syncso_dispatch_log` Eintrag für den fehlgeschlagenen Job → `final_asd`, `retry_variant`, `plate_coord`, `crop`
   - Rohantwort im `sync-so-webhook`-Log mit `error_code=generation_input_face_selection_invalid` inkl. `error_message`
2. **DB-Query** auf `syncso_dispatch_log` + `composer_scenes.dialog_shots` für die betroffene(n) `scene_id`(s):
   - Welche `asd_strategy` (`frame_number` vs. `bounding_boxes_url`)?
   - Welche `plate_coord` / `castSpeakerPlateBox`?
   - Welcher `character_id` wurde welchem Face zugeordnet?
3. **Ergebnis-Klassifikation:**
   - **A)** Rekognition-BBox zeigt daneben (Off-by-Frame, Motion, Face-Turn) → Detection-Layer.
   - **B)** Speaker→Face-Bridge hat vertauscht (Samuel-Audio zu Matthews Face) → v183 Identity-Layer.
   - **C)** Frame-Number liegt außerhalb der von Sync.so geparsten Range → Payload-Layer.
   - **D)** Format der `bounding_boxes` weicht von Sync.so-Spec ab (Reihenfolge, normiert vs. pixel) → Payload-Layer.

Ohne Phase 1 kein Code-Change. Ich präsentiere dir das Log-Ergebnis, dann folgt Phase 2 als konkreter, kleiner Patch.

### Phase 2 — Root-Cause-Fix (skizziert je nach Ergebnis)

- **Wenn A (Rekognition off):** deterministische Frame-Wahl auf den in `plate-face-detect.ts` gefundenen Best-Confidence-Frame verlagern (nicht Anchor-Frame 0), plus Multi-Frame-Bbox-URL statt Single-Frame-Coord — genau wie im v169-Guide §5 als bevorzugte Variante empfohlen. **Keine** Format-Änderung an Sync.so-Payload.
- **Wenn B (v183 Bridge falsch):** genau den v183-Confidence-Fallback identifizieren, der eine falsche Zuordnung schrieb, und auf das v166-Verhalten zurücksetzen (Bridge nur wenn 1:1-Identity-Match sicher, sonst `throw` → keine stille Zuordnung).
- **Wenn C (Frame-Range):** `asdFrameNumber`-Clamp gegen die tatsächlich rehostete Plate-Dauer statt `plate_dims.fps`-Annahme.
- **Wenn D (BBox-Format):** an Sync.so-Doku angleichen; hier reicht ein Payload-Renderer-Fix in `compose-dialog-segments`.

### Phase 3 — Verifikation

- Genau die **Neu-rendern**-Aktion auf den drei betroffenen Szenen. Kein neuer Dispatch außerhalb dieser Szenen.
- Erwartetes Log: `syncso_dispatch_log` mit `sync_status=COMPLETED`, Payload-Struktur exakt wie v169 §5.
- Wenn erneut REJECTED → Phase 1 wiederholen, kein blindes Re-Deploy.

## Was NICHT passiert

- **Kein** Auto-Detect. Nirgendwo, weder als Recovery noch als Fallback. Der v169-Invariant „N ≥ 2 → deterministic ASD only" bleibt hart durchgesetzt (der bestehende `throw multi_speaker_no_deterministic_asd_available` bleibt).
- **Keine** neue Retry-Ladder. v128 „terminal means terminal" bleibt.
- **Kein** Rewrite der ASD-Strategie. Sie ist bereits v169-kompatibel für Multi-Speaker.
- **Keine** DB-Migration, keine neuen Tabellen, keine neuen Buckets.
- **Kein** Anfassen von `compose-scene-anchor`, `sync-so-webhook`-Retry-Logic, Refund-Pfad, Watchdog, `finalize-dialog-scene`, oder N=1-Pfad (v181/v182).

## Nächster Schritt

Ich starte Phase 1 (Log-Pull + DB-Query) sobald der Plan approved ist. Melde zurück, welche der vier Klassen (A/B/C/D) es tatsächlich ist, und lege dann exakt einen zielgerichteten Patch nach — inklusive Vorher/Nachher-Beweis für die drei Szenen.

Wenn du direkt eine Vermutung hast, welche Klasse (A/B/C/D) das war, sag Bescheid — dann überspringen wir Phase 1 und ich baue sofort den entsprechenden Patch.
