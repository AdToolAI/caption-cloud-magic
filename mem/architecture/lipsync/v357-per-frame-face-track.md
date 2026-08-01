---
name: v357 Per-Frame-Face-Track & Dialog Director
description: Echtes Per-Frame-Gesichts-Tracking für Sync.so ASD statt wiederholter Standbox; Anchor-Gesichtsgröße entscheidet über Bildregie (Gruppenshot/Punch-in/Coverage) statt über Abbruch
type: feature
---

# v357 — Per-Frame-Face-Track & Dialog Director

## Ursachenbefund
Bis v356 war die an Sync.so gelieferte `bounding_boxes_url` faktisch eine
Standbox: für jeden Frame dieselben Koordinaten, nur an-/ausgeschaltet nach
Voiced-Window. Bewegt sich die Figur, zeigt die Box ins Leere → Sync 3 liefert
das Eingangsvideo unverändert zurück ("Passthrough").

## Regeln
- `_shared/face-track.ts` erzeugt eine echte Bewegungsspur: AWS-Stills
  (Remotion Lambda, NIE Replicate) → Rekognition DetectFaces → nächstliegende
  Box zur Referenz (Tracking-Kontinuität) → lineare Interpolation + Glättung.
- Kontextaufschlag Pflicht: 25 % seitlich/oben, 30 % unten. Sync 3 arbeitet mit
  Umfeld besser als mit engem Mundausschnitt.
- Der "alle Frames dieselbe Box"-Notpfad ist verboten. Fehlen Voiced-Windows,
  gilt der ganze Clip explizit als ein Fenster — die Spur bleibt bewegt.
- `_shared/dialog-director.ts`: Anchor-Gesichtsgröße entscheidet über Regie,
  NIE über Abbruch. group_shot ≥ 150px, punch_in ≥ 110px (= 220px Ziel bei
  max. 2,0× digitalem Zoom), darunter coverage.
- Turn-Handles: 200 ms Vor-/Nachlauf im Preclip-Fenster.
- Passes sind NICHT verkettet: jeder Pass nutzt das unveränderte Original-Plate,
  bis zu 4 laufen parallel (v193 fan-out). Der Kommentar, der eine Kette
  behauptete, war veraltet und wurde korrigiert.
- Einziger harter Guard bleibt `mouth-motion-verdict` NACH dem Lauf.
