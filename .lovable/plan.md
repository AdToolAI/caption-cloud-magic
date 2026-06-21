## Befund

**Ja, ich weiß jetzt, was das Problem ist.** Sync.so dokumentiert klar: `bounding_boxes_url` muss eine JSON-Datei liefern, deren `bounding_boxes`-Array **genau einen Eintrag pro Videoframe** enthält. Unsere v162-FPS-Korrektur ging in die richtige Richtung, ist aber noch um 1 Frame daneben.

Aktueller Fehler in der Pipeline:

```text
Preclip-Render:
  durationInFrames = ceil(durationSec * 30)

Bounding-Boxes v162:
  frameCount = round(durationSec * 30)
```

Konkrete Log-Beispiele der fehlgeschlagenen Szene:

```text
Pass 1: dur=2.435s
Renderframes: ceil(2.435 * 30) = 74
BBox-JSON:    round(2.435 * 30) = 73  -> 1 Frame zu kurz

Pass 2: dur=0.936s
Renderframes: ceil(0.936 * 30) = 29
BBox-JSON:    round(0.936 * 30) = 28  -> 1 Frame zu kurz
```

Das passt exakt zu Sync.so `generation_unknown_error`: Die URL ist erreichbar, das Format stimmt, `auto_detect:false` stimmt, aber die Array-Länge passt nicht zum tatsächlichen MP4.

## Plan v163

1. **Preclip-Ergebnis um echte Renderframes erweitern**
   - `renderPassFacePreclip` gibt zusätzlich `frameCount` zurück.
   - Dieser Wert ist exakt `durationInFrames`, also die Framezahl, die Remotion wirklich rendert.

2. **Bounding-Boxes für Preclips nicht mehr aus Dauer schätzen**
   - In `compose-dialog-segments` wird für Preclip-Pfade `preclip_frame_count` gespeichert.
   - `v163_bbox_framecount` nutzt dann exakt diese Framezahl.
   - Keine `round(duration * fps)`-Schätzung mehr für Preclips.

3. **Optionaler MP4-Probe nur noch als Diagnose/Fallback**
   - Falls ein alter gecachter Preclip keinen gespeicherten `preclip_frame_count` hat, dann fallback:
     - zuerst MP4-Duration probe,
     - dann `ceil(duration * fps)`, nicht `round`.

4. **Fail-closed statt Provider-Fehler**
   - Wenn für einen Preclip keine sichere Framezahl berechnet werden kann, wird vor Sync.so abgebrochen und refunded.
   - Kein stiller Fallback auf Auto-Detect.

5. **Logging verschärfen**
   - Neue Marker:
     - `version=v163`
     - `v163_preclip_render OK frames=74 fps=30 dur_render=2.467`
     - `v163_bbox_framecount source=preclip_frame_count frames=74`
   - Damit sieht man sofort, ob Renderframes und JSON-Länge identisch sind.

6. **Fehlgeschlagene Szene sauber zurücksetzen**
   - Scene `becaa5ce-e4c3-47b7-933d-766e83807b9c` wird für Lip-Sync zurückgesetzt, damit keine alten 73/28-Frame-JSONs wiederverwendet werden.

## Nicht ändern

- Kein Auto-Detect.
- Kein Rückfall auf `lipsync-2-pro`.
- Kein Full-Plate-Morphing-Fallback.
- Der Weg bleibt: **1 bis 4 Sprecher = Single-Face-Preclip + `sync-3` + `bounding_boxes_url` + Mux zurück in die Master-Plate**.

## Erwartetes Ergebnis

Nach Umsetzung muss Sync.so für die gleiche Szene Bounding-Box-JSONs mit exakt diesen Längen erhalten:

```text
Pass 1: 74 Einträge statt 73
Pass 2: 29 Einträge statt 28
```

Damit ist der wahrscheinlichste verbliebene `generation_unknown_error`-Trigger entfernt.

<presentation-actions>
  <presentation-open-history>View History</presentation-open-history>
</presentation-actions>

<presentation-actions>
<presentation-link url="https://docs.lovable.dev/tips-tricks/troubleshooting">Troubleshooting docs</presentation-link>
</presentation-actions>