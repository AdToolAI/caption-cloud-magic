## v140 — Radical Cleanup statt weiterer Hotfixes

Der Fehler `syncso_segments_dispatch_400` besteht weiterhin. Deshalb wird die Lip-Sync-Pipeline nicht weiter punktuell gepatcht, sondern auf einen einzigen Wire-Payload-Pfad konsolidiert.

### Problem

- `compose-dialog-segments/index.ts` hatte mehrere historische ASD-Mutationspunkte: initialer Strategy-Setter, v136 Center-Override, Plate/BBox-Fallbacks, Face-Gate Snap-Mutation und finaler Payload-Sanitizer.
- Dadurch konnte die Forensik korrekt aussehen, während der tatsächliche Sync.so-Wire-Payload aus einem anderen Branch kam.
- Das ist nach 6 Wochen Patch-Kaskade nicht mehr sinnvoll wartbar.

---

### v140-Entscheidung

**Kein weiterer Hotfix.** Ab jetzt gibt es vor `fetch(${SYNC_API_BASE}/generate)` genau einen finalen ASD-Canonicalizer:

```ts
payload.options.active_speaker_detection = normalizeCanonicalAsd(...)
```

- Akzeptiert nur vier Sync.so-konforme Shapes: `auto_detect:true`, flat `coordinates:[x,y]`, `bounding_boxes_url`, inline `bounding_boxes`.
- Flattened versehentliches `[[x,y]]` zu `[x,y]` defensiv, blockt aber fehlende/NaN-Koordinaten vor Provider-Dispatch mit Refund.
- Face-Gate darf Snap-Koordinaten nur noch persistieren; es darf den Wire-Payload nicht mehr nachträglich mutieren.
- v136 Center-Override ist entfernt, damit nicht zwei Preclip-Strategien gegeneinander arbeiten.

### Umsetzung

1. Version auf `v140.0` gesetzt.
2. `normalizeCanonicalAsd()` als finale Single-Wire-Builder-Schicht eingeführt.
3. v136 `coords-pro` Center-Override entfernt.
4. Face-Gate Snap-Mutation entfernt; Snap wird nur noch als Diagnose/Persistenz notiert.
5. Bestehende `BAD_COORDS_SHAPE`-Assertion und `WIRE_PAYLOAD` bleiben als Guard/Forensik erhalten.

### Verifikation

- Erwartete Logs: `BOOT version=v140.0`, `v140_ASD_CANONICAL`, `WIRE_PAYLOAD version=v140.0`.
- Bei ungültigem ASD: lokaler `DISPATCH_BLOCKED_V140_CANONICAL_ASD`, kein Sync.so Call, Refund.
- Bei Sync.so-400: `wire_options=...` zeigt den finalen kanonischen Payload direkt an.

### Nicht angefasst

- v138 Plan-D Fan-out Logik, v139 Coord-Refresh-Scoping, Batch-Preclip-Defaults, Sync.so Webhook, Stitch, Audio-Normalisierung, Wallet/Refund-Pfad, Frontend.
- Die Plate-Identity / v117 SOFT-WARN-Logik (orthogonal zum Shape-Problem).
