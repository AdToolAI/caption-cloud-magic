---
name: v358 Preclip-Dimensionsvertrag & atomare Pass-Slots
description: Sync.so-BBox und Video müssen denselben real gemessenen Pixelraum verwenden; quadratische Preclips werden vor Dispatch auf 720x720 geprüft und parallele Passes dürfen terminale Geschwister nicht zurücksetzen
type: feature
---

# v358 — Preclip-Dimensionsvertrag

## Bestätigte Ursache

Beim fehlgeschlagenen Kailee-Pass lag die BBox im erwarteten 720×720-Preclip-Raum,
Sync.so erhielt laut Provider-Fingerprint aber ein 1928×1076-Video. Die Box zeigte
dadurch auf den falschen Bildbereich und Sync.so lieferte einen unveränderten
Passthrough zurück.

## Invarianten

- Dialog-Preclips werden mit `forceWidth=720` und `forceHeight=720` an Lambda gesendet.
- Jeder fertige oder wiederverwendete Preclip wird vor Sync.so mit `probeMp4Dims`
  gemessen. Ein unbekannter oder abweichender Pixelraum wird nicht dispatcht.
- BBox-Skalierung, Per-Frame-Track und Flächenberechnung leiten Breite/Höhe aus
  den real gemessenen Preclip-Dimensionen ab, nicht aus Plate- oder Crop-Annahmen.
- Der Preclip-Cache-Key enthält Pipeline-Version und Zielmaße; alte 16:9-Artefakte
  dürfen nicht wiederverwendet werden.
- `update_dialog_pass_slot` schützt terminale Slots (`done`, `failed`, `completed`,
  `cancelled`) vor Regression auf nicht-terminale Zustände durch verspätete
  parallele Fan-out-Updates.

## Verhalten bei Vertragsbruch

Vor dem Provider-Dispatch wird mit `preclip_dimension_mismatch` abgebrochen. Damit
entsteht kein kostenpflichtiger Sync.so-Lauf mit einer BBox im falschen Raum.