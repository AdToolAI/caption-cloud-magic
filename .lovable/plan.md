## Ursache (an Code + DB verifiziert)

Am 27.07. liefen 4 Sprecher sauber: `coord_source = plate-identity-cid-primary`, Methode `per-char-hungarian`, `resolved = 4/4`, Crops 394–700 px.

Zwei Eingriffe aus dieser Session brechen genau diesen Pfad:

1. **v325 „Plate-Invariant"** (`compose-dialog-segments`, Z. 1541–1588): verwirft persistierte Geometrie bei Clip-URL-/Dims-Abweichung und lässt nur eine *identity-only projection* (`assignmentLock`) übrig — Live-Detektion erzwungen.
2. **v326 „Geometry-Rowmajor-Lock"** (`compose-video-clips`): schreibt Slot→Character-Locks, damit keine manuelle Face-Map nötig ist.

**Der Bruch:** Die Live-Detektion liefert Gesichter **ohne** `characterId` (`resolvedCount: 0`, DB-belegt für Szene `23b381ac…`). Der Lock-Zweig (Z. 2193–2225) sucht sein Gesicht aber über `face.characterId` ⇒ greift nie ⇒ Fallback `v183-unlabeled-fallback` / `plate-persisted-mouth-positional`. Zusätzlich sind die Live-Boxen winzig (47×63 auf 1284×718), der Crop wird auf `minSize: 128` geklemmt. Der real dispatchte Clip (720×720) zeigt das Gesicht rechts angeschnitten, `face_share` 0.18/0.15 statt ≥ 0.42 — und der Gate meldet `FACE_GATE_PROBE_UNAVAILABLE` (`non_blocking`), dispatcht also blind.

## Plan v329 — Identity/Geometry-Split (Architekturfix statt Patch)

### A. Datenmodell trennen (Kern)
`plate_identity` wird in zwei getrennte Felder aufgeteilt:
- **`identity`** — `{ slot → characterId, source }`, plate-unabhängig, **überlebt jede Eviction**.
- **`geometry`** — `{ faces[], dims, sourceClipUrl, detectedAt }`, gilt nur für genau ein Plate, wird von v325 wie bisher verworfen.

Verbunden werden beide **ausschließlich über den Slot-Index** (row-major, wie v242). Damit gibt es keinen Zustand mehr, in dem ein Lock existiert, aber kein auflösbares Gesicht — die Fehlerklasse verschwindet, nicht nur dieser Fall. Alle Resolver (`plate-face-identity.ts`, `plateFaceSlotRouter.ts`, `compose-dialog-segments`) lesen künftig `identity.bySlot`; `characterId` auf Face-Objekten wird zum abgeleiteten Wert, nicht zur Quelle. Legacy-Reader für alte `plate_identity`-Rows bleibt für Bestandsszenen.

### B. Untaugliche Detektion wiederholen statt hochrechnen
Der 128-px-Floor ist kein Rundungsfehler, sondern das Signal „Detektion untauglich". Deshalb:
- Box-Breite < 3,5 % der Plate-Breite ⇒ **Re-Detect auf 2×-hochskaliertem Frame** (Rekognition hat auf kleinen Köpfen eine harte Auflösungsgrenze).
- Erst wenn auch das scheitert: plate-proportionales Fenster um den Mund-Landmark (22–28 % Plate-Höhe, mind. 288 px) — explizit als `coord_source: geometry-fallback-proportional` markiert, damit es in Logs sichtbar bleibt.
- `minSize: 128` entfällt ersatzlos.

### C. Face-Gate scharf schalten
- Probe-Frames aus `composer-frames/…/motion-frames/` (v327-Client-Probe) nutzen statt sofort `probe_unavailable`.
- Bleibt die Probe unmöglich **und** `face_share` unter dem Floor: Pass abbrechen mit Refund (`preclip_face_share_too_low`), statt einen garantiert wirkungslosen Sync.so-Job zu bezahlen. Blindes Dispatchen wird abgeschafft.

### D. Regressionsschutz
Genau das fehlte v325/v326 und ist der Grund, warum der Bruch erst beim Kunden auffiel:
- Fixture-Test (Deno) mit den echten `plate_identity`-Rows vom 27.07. **und** der kaputten Szene `23b381ac…`: prüft `resolvedCount === speakerCount` und Crop-Größe > Floor.
- `syncso_dispatch_log`: `coord_source`, `crop.size`, `plate_box_w_pct`, `lock_applied`, `face_share` pro Pass.
- `SceneInlinePlayer`: bei `preclip_face_share_too_low` Hinweis „Gesichts-Geometrie unsicher — Szene neu berechnen" + Retry statt Endlos-Spinner.
- Szene `23b381ac…` nach Deploy einmalig neu dispatchen.

## Technische Details
- `supabase/functions/_shared/plate-face-identity.ts` — Split `identity` / `geometry`, Slot-Bridge, Legacy-Reader.
- `supabase/functions/compose-dialog-segments/index.ts` — Resolver auf `identity.bySlot` (Z. 2193–2290), Geometrie-Gate, Logs.
- `supabase/functions/compose-video-clips/index.ts` — schreibt v326-Lock ins neue `identity`-Feld.
- `supabase/functions/_shared/pass-face-preclip.ts` — Floor raus, Re-Detect + proportionales Fenster.
- `supabase/functions/_shared/syncso-face-gate.ts` — motion-frames als Probe-Quelle, Hard-Fail + Refund.
- Sync.so-Payload-Shape (`sync-3`, `cut_off`, `bounding_boxes_url`) bleibt unverändert.

## Abwägung
Der Split (A) ist ein Eingriff in ein Feld, das ~6 Funktionen lesen — mehr Arbeit als das Nachkleben von `characterId` an Live-Faces. Dafür ist danach strukturell ausgeschlossen, dass ein Lock ohne Trägergeometrie entsteht; die Patch-Variante würde beim nächsten Detektor-Wechsel erneut brechen. Wenn du heute nur entsperrt haben willst, kann ich A als reine Slot-Bridge in ~20 Minuten liefern und den Split nachziehen — sag dann kurz Bescheid.
