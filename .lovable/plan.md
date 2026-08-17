# FA-4 Face-Candidate Fix Contract (Contract-only)

Status bleibt: **TECHNICAL PASS / VISUAL REVIEW: ISSUES**, Root-Cause-Lock = PASS / FROZEN.
Dieser Schritt liefert ausschließlich Dokumentation: kein Code, kein Deploy, kein Render, keine Migration, keine DB-Writes.

## Schritt 0 — Doku-Hygiene (rein redaktionell)

In `docs/v433-motion-studio-final-acceptance.md` die Reste entfernen, die dem abgeschlossenen Lock widersprechen: den Arbeitsplan-Abschnitt „Nächster Schritt: read-only Root-Cause-Lock“, die Zwischentabelle mit Q1 = „NICHT BEWIESEN“, den Log-Retention-Blocker und den Variante-A-Arbeitsplan. Erhalten bleiben: Lock = PASS / FROZEN, finale Beweiskette, die vier geschlossenen Lock-Fragen, Sanity-/Hungarian-Gegenprobe, eingefrorene Fix-Richtung und der Statussatz. Keine fachliche Neubewertung.

## Schritt 1 — Neuer Abschnitt `## FA-4 Face-Candidate Fix Contract`

Enthält Root-Cause-Bezug, Contracts A–F, Regression-Fixture, Owner-/Scope-Matrix, Nicht-Scope-Liste, Testplan, minimaler späterer Deploy-Scope.

### Contract A — Candidate Sanity VOR Assignment

Ein einziger kanonischer Filter, angewendet auf jeden erkannten Plate-Face, bevor irgendeine Character-Zuordnung stattfindet. Kriterien exakt die bereits produktiven Grenzen (heute in `compose-dialog-segments/index.ts` als `bboxSanity()` ab Zeile 2376): `area_ratio` in [0.003, 0.25], `aspect` in [0.4, 2.5], nicht-degenerierte Box, Box innerhalb Plate-Geometrie mit bestehender Toleranz. Ablehnungsgründe bleiben `area_too_small`, `area_too_large`, `degenerate`, `out_of_plate`, `aspect_invalid`. Confidence und `matchConfidence` dürfen den Filter nicht überspringen. Keine neuen Schwellen.

### Contract B — Global bijektive Geometrie-Zuordnung

Nach Contract A: Anchor-Slots sind Character-Wahrheit, Plate-Faces sind rein geometrische Kandidaten.

- Primary Cost = euklidische Distanz normalisierter Center (Anchor ↔ Plate), wie heute in `routePlateFacesToAnchor()`.
- Globale Minimum-Cost-Bijektion über die gefilterte Kandidatenmenge. Kein Greedy, kein `slot i → slot i`, kein First-Match per `characterId`.
- Unlabeled Faces sind vollwertige Kandidaten.
- Ein Plate-Face darf nie zwei Characters tragen (Bijektion ist verpflichtend).
- Extra-Faces bleiben im Ergebnis, aber ohne Character (bestehende v278.3-Semantik).
- Weniger plausible Faces als Characters → `countMismatch` → fail-closed, kein Teil-Dispatch.
- Maximal zulässige Geometrie-Abweichung: es wird kein neuer Grenzwert erfunden. Verwendet wird die bestehende Distanz-→-Confidence-Abbildung des Routers (`matchConfidence = 1 - d/0.5`, also d ≥ 0.5 = wertlos); ob daraus ein harter Cutoff wird, ist im Contract als offener Implementierungsparameter markiert und erst mit Test-Beleg zu fixieren.
- Identity-Labels wirken ausschließlich als Tie-Break/Zusatzscore und dürfen nie einen sanity- oder geometrie-invaliden Kandidaten erzwingen.

### Contract C — assignmentLock-Semantik

`assignmentLock` bleibt Identity-Fence `speaker_idx → character_id` und bestimmt nur, welcher Character für einen Anchor-Slot erwartet wird. Die Plate-BBox wird für diesen Character jedes Mal neu aus der validierten globalen Zuordnung gewonnen.

Ersetzt bzw. entwertet werden:

- `anchorRekFacesByCid` First-Match-Autorität (Zeilen ~2126–2160) — entfällt als Auswahlquelle.
- `v183_anchor_identity_slot_bridge` (~2000–2039) als autoritative Identity-Zuweisung — nur noch Diagnostik.
- `byIdRanked`-Confidence-Ranking (~2054–2090) als Auswahlpfad — nur noch Supporting Score.
- Jeder Confidence-Shortcut, der Geometrie/Sanity umgeht.

### Contract D — Sanity IMMER nach Assignment

Die final gewählte BBox wird erneut objektiv validiert. Der `trustedSlots`-Shortcut in `v239_repair_gate` (~2303–2420) darf `bboxSanity()` nicht mehr überspringen. Confidence darf nur Diagnostics, Supporting Score und die Frage „zusätzliche Identity-Prüfung nötig?“ beeinflussen — nie eine geometrisch invalide Box freigeben.

### Contract E — Deterministisches Preclip-Crop-Containment

Vor jedem Sync.so-Dispatch ohne externen Vision-Service beweisbar:

1. Target-BBox des zugeordneten Characters liegt vollständig im Preclip-Crop.
2. Der Crop stammt aus genau dieser final zugeordneten Plate-BBox.
3. Kein Zentrum eines anderen zugeordneten Speaker-Faces liegt im zulässigen Target-Bereich des Crops.
4. Plate-space → Crop-space-Transformation ist deterministisch und bounds-valid.
5. Die an `bounding_boxes_url` übergebene Box entspricht exakt dieser transformierten Target-BBox.

Sonst FAIL CLOSED vor Sync.so. Fehlerklassen-Name noch offen: das bestehende Inventar (`face_validation_failed`, `v153_plate_bbox_required`, `v133_identity_ambiguous`, `v187_preclip_required_no_fullplate_fallback`) wird im Implementierungsschritt geprüft; erst dann wird entschieden, ob eine bestehende Klasse passt oder eine neue (Arbeitstitel `preclip_identity_geometry_mismatch`) eingeführt wird.

### Contract F — Vision Probe

`verifyFaceBeforeDispatch` bleibt optionale Zusatzevidenz. Ist der deterministische Contract E erfüllt, darf `face_probe_unavailable` non-blocking bleiben. Ist Contract E nicht erfüllt, ist der Dispatch unabhängig vom Probe-Ergebnis verboten. Damit wird aus dem Identity-Bug kein Availability-Bug.

## Schritt 2 — Regression-Fixture S11

Fixture: Plate 1284×718, 4 Anchor-Slots, 10 erkannte Plate-Faces inklusive der drei False-Positive-Labels. Erwartetes Ergebnis:

```text
Sarah   → [226,244,286,327]
Samuel  → [476,209,540,294]
Matthew → [753,187,819,277]
Kay     → [1030,208,1099,296]
```

Nachzuweisen: untergroße False Positives fallen vor Hungarian raus; genau die vier großen Faces bleiben; unlabeled Matthew/Kay werden korrekt gewählt; High-Confidence-Tiny-Boxes gewinnen nie; Kandidaten-Reihenfolge ist ergebnisneutral; Extra-Faces verschieben nichts; keine Box doppelt.

Zusätzliche Fälle: N=1, N=2, N=4, Extra-Faces, zu wenige plausible Faces → fail-closed, duplizierte/nahezu identische Geometrie, umsortierter Detector-Output, hohe Confidence bei invalider Geometrie, korrekte Geometrie ohne Label, korrekte Geometrie mit widersprüchlichem Label.

## Schritt 3 — Owner-/Scope-Matrix (Analyse, kein Code)

- Kanonischer Sanity-Filter + Bijektion: `supabase/functions/_shared/plateFaceSlotRouter.ts` ist der vorgesehene Owner — er besitzt bereits Detection, Normalisierung und `optimalAssignmentMin()`. Der Filter gehört zwischen `detectFacesOnBytes()` und den Matrix-Aufbau.
- Zu neutralisieren in `compose-dialog-segments/index.ts`: Bridge-Autorität, `anchorRekFacesByCid`-First-Match, `byIdRanked`-Auswahl, `trustedSlots`-Shortcut im `v239_repair_gate`.
- Weitere Betroffene: `_shared/plate-face-identity.ts` (`resolvePlateFaceIdentities`), `_shared/pass-face-preclip.ts` (Crop-Transform, `computeFaceCrop`/`computeMouthCenteredCrop`), `_shared/asd-strategy.ts`, `sync-so-webhook/index.ts` (nur lesend geprüft), `_shared/scene-hard-reset.ts`.
- Späterer minimaler Deploy-Scope: `compose-dialog-segments` (zieht `_shared` ein). Kein weiterer Function-Redeploy vorgesehen.

## Nicht im Scope (FROZEN)

`composer_pipeline_jobs`, `sync_segment.segment_id`, `dialog_turn.id`, `speaker_idx`-Semantik, FA-4 Fan-out-Fix, G3.2.2, F1, RS3, `audio_mux`, Stitch/Finalizer, `processed_video_url`, Accounting/P1-A, Preclip Exactly-Once-Dispatch/P0, P1-B Image-Encoding-Cache.

## Ergebnis

Nach Umsetzung dieses Doku-Schritts wird der Status ausgegeben:

`FA-4 FACE-CANDIDATE FIX CONTRACT READY → STOP`
