---
name: v361 Rekognition-Koordinatenvertrag
description: Rekognition-Boxen werden im Raum der gesendeten Bytes detektiert und explizit in den Zielraum projiziert; implausible Boxen werden verworfen; Watchdog dispatcht keine toten Szenen mehr.
type: feature
---

# v361 — Koordinatenvertrag für AWS-Rekognition-Boxen

## Ursache der Passthroughs (Szene 89c5e01c)
Rekognition liefert **normalisierte** Boxen bezogen auf das **gesendete Bild**.
Der Code multiplizierte diese Werte mit den **Plate-Dimensionen** (16:9), obwohl
detektiert wurde auf dem **Anchor-Still** (1:1). Ergebnis: systematisch nach
rechts/unten verschobene, in der Höhe gestauchte Boxen. Preclips zeigten Drucker
und Fensterrahmen statt Gesichter → Sync.so gab das Video unverändert zurück.
AWS hat korrekt detektiert; der Fehler lag in unserer Rücktransformation.

## Vertrag
- `_shared/rek-image-space.ts` ist die einzige Quelle für Dimensionssondierung
  (`probeImageDims`) und Projektion (`projectNormBox`, `normToPixels`).
- **Detektionsraum = Raum der gesendeten Bytes.** Caller-Dimensionen sind der
  **Zielraum**, niemals der Detektionsraum.
- Jede Box wird vor Verwendung mit `isPlausibleFaceBox` geprüft. Verworfene
  Boxen loggen `v361_implausible_box_dropped`.
- Abweichende Seitenverhältnisse loggen `v361_aspect_mismatch` und werden mit
  contain-Semantik projiziert.

## Betroffene Stellen
- `_shared/rekognition-face-collection.ts` — sondiert Dims, liefert `normBbox`,
  `sourceDims`, `dimsSource`.
- `_shared/cast-identity-lock.ts` — projiziert Boxen in den Zielraum.
- `_shared/plateFaceSlotRouter.ts` — nutzt zentrale Sonde + Projektion.
- `lipsync-watchdog` — Terminal-Guard: fehlgeschlagene Szenen erzeugen keine
  Geister-Dispatches mehr (`skipped_scene_failed`).
