## Bug: `dispatch_crash: Cannot read properties of undefined (reading '0')`

### Root Cause
In `supabase/functions/compose-dialog-segments/index.ts` Zeile **4816–4818** (v139.1 coords-shape assert) wird folgendes geloggt:

```ts
console.log(
  `... coords_shape ok=[${c[0]},${c[1]}] frame_number=${coordsAsd.frame_number}`,
);
```

Dieser Log läuft im Block `if (coordsAsd && coordsAsd.auto_detect === false)` **immer**, sobald `auto_detect=false` ist — egal ob `coordinates` oder `bounding_boxes_url` benutzt wird.

Bei v153 bbox-url-pro (4 Sprecher, der genaue Fall aus dem Screenshot) ist `coordinates` **nicht** gesetzt, sondern `bounding_boxes_url`. Damit ist `c = coordsAsd.coordinates = undefined`. Der frühere Validator lässt den Pass passieren (`hasBoxes=true`), aber dann wirft `${c[0]}` in der Log-Zeile sofort den TypeError → DISPATCH-CRASH direkt nach `v140_ASD_CANONICAL`.

Logs der gecrashten Szene `8219c1b9-…` bestätigen das exakt:
- `v140_ASD_CANONICAL asd={"auto_detect":false,"bounding_boxes_url":"…"}`
- direkt danach `TypeError: Cannot read properties of undefined (reading '0')`

Das ist eine reine Regression aus der v153-Aufräumphase — der bbox-url-Pfad hat keinen `coordinates`-Array, der Log wurde nie an diesen Pfad angepasst.

### Fix (1 Datei, ~5 Zeilen)
**`supabase/functions/compose-dialog-segments/index.ts`** (~Zeile 4816)

Log-Branch je nach ASD-Form aufteilen:

```ts
if (coordsOk) {
  console.log(
    `... coords_shape ok=[${c[0]},${c[1]}] frame_number=${coordsAsd.frame_number}`,
  );
} else if (hasBoxes) {
  const boxesKind = coordsAsd.bounding_boxes_url ? "bounding_boxes_url" : "bounding_boxes";
  console.log(
    `... coords_shape ok=${boxesKind} frame_number=${coordsAsd.frame_number ?? "n/a"}`,
  );
}
```

Damit:
- bbox-url-pro (v153-Standard) loggt sauber `coords_shape ok=bounding_boxes_url`
- klassischer Coord-Pfad bleibt unverändert
- kein Crash mehr nach `v140_ASD_CANONICAL`

### Version & Verify
- Version bump `COMPOSE_DIALOG_SEGMENTS_VERSION` → `v153.7`
- Deploy `compose-dialog-segments`
- Erwartung in Logs: `v140_ASD_CANONICAL …bounding_boxes_url…` → `coords_shape ok=bounding_boxes_url` → `WIRE_PAYLOAD` → `DISPATCH` → Sync.so 200, alle 4 Sprecher bekommen Lipsync (nicht nur 3/4).

### Was NICHT angefasst wird
- Keine ASD/Preclip-Logik, kein v140-Builder, kein v143-Rehost, kein Refund-Pfad. Nur die fehlerhafte Log-Zeile.
