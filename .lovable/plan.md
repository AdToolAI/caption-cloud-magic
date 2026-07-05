## Ansatz: Character-ID als primärer Schlüssel

Ja — die saubere Lösung ist, den ganzen Mapping-Pfad konsequent an der **Character-ID** aufzuhängen statt an visueller Reihenfolge oder bbox-Center-Nähe. Das eliminiert die eigentliche Ursache des v153.2-Duplikat-Blocks (zwei Speaker landen auf derselben Plate-Box) statt sie nur zu maskieren.

## Was v183 falsch macht

`compose-dialog-segments/index.ts`, Speaker-Loop Zeile 1565–1619:

- `byId = Map<strippedCharacterId, PlateFace>` wird gebaut aus `plateIdentityMap.faces` — **kollabiert Duplikate stillschweigend** (`Map.set` überschreibt), und liefert für zwei Speaker mit derselben stripped-ID **dasselbe Face-Objekt**.
- Es gibt keine Uniqueness-Prüfung: `byId.get(cid)` darf denselben Face-Eintrag für Speaker 0 und Speaker 1 zurückgeben → identische `speakerPlateBboxes[0]` und `[1]` → v153.2 blockt.
- Für Speaker ohne `byId`-Match fällt der Code bei N ≥ 2 gar nicht mehr auf `unlabeled` zurück (v166-Regression) → dieser Slot bleibt leer und blockt als `missing`.

## Fix in `compose-dialog-segments` (nur diese Datei)

### 1. Character-ID-First mit Confidence-Sortierung

`plateIdentityMap.faces` ist bereits pro Face mit `characterId` + `matchConfidence` annotiert. Neu bauen wir:

```
byIdRanked = Map<strippedCharacterId, PlateFace[]>   // absteigend nach matchConfidence
```

statt einer flachen `Map`. Damit lässt sich beim zweiten Speaker mit derselben stripped-ID der **nächstbeste** Face-Kandidat für denselben Char nehmen (falls Rekognition zwei Faces mit demselben Char-Label hat, z. B. Reflexion oder Statist).

### 2. Uniqueness-Enforcement per assigned-Set

Ein `assignedFaceKeys = new Set<string>()` (Key = plate-face-Index oder bbox-Signatur). Vor der Zuweisung an `speakerPlateBboxes[idx]` prüfen. Wenn das Top-Ranked-Face für den `cid` schon vergeben ist:

1. nächstes noch freies Face mit demselben `cid` aus `byIdRanked` versuchen,
2. sonst — nur wenn `plateIdentityMap.faces.length >= speakers.length` — nächstes freies `unlabeled` Face per Visual-L→R zuweisen und Log `v183_unlabeled_fallback`,
3. sonst Slot leer lassen (führt zu `plate_box_missing`, nicht `duplicate`) und Log `v183_identity_collision cid=<...> reason=exhausted`.

### 3. Cast-Konfig-Guard vor dem Mapping

Bevor überhaupt gemappt wird, in dem Speaker-Array eine Uniqueness-Prüfung auf `stripIdPrefix(character_id)`:

- Wenn zwei Speaker denselben stripped `character_id` haben (echter Cast-Bug, z. B. zwei Saved-Outfit-Look-Varianten desselben Basis-Chars als getrennte Sprecher), sofort mit einer klaren Meldung refunden:

> „Lip-Sync abgebrochen: {Speaker A} und {Speaker B} verweisen auf denselben Basis-Charakter. Bitte einem der beiden einen anderen Character zuweisen (oder die Rollen zusammenfassen). Credits wurden zurückerstattet."

Log-Class: `v183_cast_duplicate_character_id`. Das ist ein echter Konfig-Fehler, den man nicht auto-fixen sollte.

### 4. v166 Slot-Bridge lockern

`anchorFaces.length === plateIdentityMap.faces.length` → `anchorFaces.length >= 1 && anchorFaces.length <= plateIdentityMap.faces.length`, damit die Bridge auch greift wenn die Plate mehr Gesichter zeigt als der Anchor kannte (Statisten). Zuweisung bleibt Visual-L→R, aber **auf die Anchor-Slots begrenzt** — der Rest bleibt `unlabeled` und ist Fallback-Material für Punkt 2.

### 5. Präzisere v153.2-Meldungen

Wenn der Preflight trotzdem noch blockt (echte Plate-Ambiguität, keine Konfig-Kollision), Sprechernamen einsetzen: *„{Speaker A} und {Speaker B} wurden auf dasselbe Gesicht in der Szene gemappt — bitte Szene neu rendern, sodass beide frontal und getrennt sichtbar sind."*

### 6. Version-Bump

`COMPOSE_DIALOG_SEGMENTS_VERSION = "v183"` und pro neuem Log-Punkt ein eigenes Tag (`v183_cast_duplicate_character_id`, `v183_identity_collision`, `v183_unlabeled_fallback`, `v183_anchor_bridge_partial`).

### 7. Redeploy

Nur `compose-dialog-segments`. Kein Client-Code, keine anderen Edge Functions, keine DB-Migration.

## Verifikation

1. Die gefailte Szene aus dem Screenshot neu rendern.
   - Falls Cast-Bug (gleicher Basis-Char zweimal): sofort `v183_cast_duplicate_character_id` mit Namen — actionable für dich.
   - Falls Rekognition-Kollision (zwei Faces, gleicher Char-Label): `v183_identity_collision` mit `resolution=reassigned` oder `unlabeled_visual`, Dispatch geht durch.
   - Falls echte Plate-Ambiguität: klar formulierter `plate_box_duplicate`-Refund mit Sprecher-Namen.
2. `syncso_dispatch_log`: `meta.compose_version = "v183"`; provider-übergreifend gleicher Pfad.
3. Regression-Check: bestehende 4-Sprecher-Szenen (Hailuo + HappyHorse) grün wie zuvor.

## Nicht Teil dieses Plans

- Kein Touch an compose-video-clips (weder Hailuo, HappyHorse noch Kling).
- Kein Touch am v182 N=1 Tail-Hold / Kling-Anti-Clone / DialogStitchVideo / Muxer.
- Kein Rückbau der v170 `stripIdPrefix`-Normalisierung — sie wird weiter gebraucht.
- Kein Aufweichen der 8 px-Duplikat-Schwelle — der Guard bleibt streng.