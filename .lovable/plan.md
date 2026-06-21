## Diagnose: 4-Sprecher-Szene rendert ohne hörbares/sichtbares Lipsync

### Was wir aus den Logs/DB wissen
- v153.8 lief sauber durch: 4 Passes (Samuel→Matthew→Kailee→Sarah), alle `status=done`, jeweils `bounding_boxes_url`, `sync_mode=cut_off`, `model=sync-3`.
- Coords je Pass (Plate vermutlich 1280×720):
  - p0 Samuel (618,421), p1 Matthew (793,377), p2 Kailee (974,379), p3 Sarah (1191,421)
- Audio je Pass ist eine "tight WAV" mit nur den Worten dieses Sprechers (Segmente:
  Samuel 0–2.37s, Matthew 2.62–3.64s, Kailee 3.89–6.72s, Sarah 6.97–8.83s).
- `preclip_crop` ist überall `null` → Compositor fällt auf `faceMask` (radial circle, radius = `0.28 × min(w,h)` ≈ 202 px bei 720 px Achse) zurück.
- Plate-Probe zeigt **10.125s** echte Länge vs. 9s requested.

### Symptom-Mapping
- "Char 1+2 reden stumm die ganze Szene" → wir sehen die **Pristine-Plate** (Hailuo lässt alle Köpfe durchgehend mit-mimen). D.h. die Sync.so-Overlays für p0/p1 landen **nicht über deren Mund**.
- "Char 3+4 öffnen den Mund gar nicht" → wir sehen das **Sync.so-Output** für p2/p3, aber Sync.so hat in dem Frame-Bereich **keinen Mund animiert** (entweder Bbox-Frame außerhalb der echten Plate-Länge, oder coords liegen daneben).

Beide Symptome zeigen auf **falsche Bbox-/Coord-Geometrie** für die Sync.so-Eingabe und/oder für die Compositor-Mask.

### Hypothesen (zu verifizieren, bevor wir patchen)
1. **Plate-Auflösung ≠ Bbox-Koordinatensystem.** Die Bboxes kommen aus Gemini Vision auf einer 1280×720-Annahme, aber `coords`/`bounding_boxes_url` werden Sync.so im **echten** Pixelraum übergeben (z.B. 1280×720 vs. echtes 1248×704 oder ein anderes seitenverhältnis-bedingtes Padding). Selbst ein 16-px-Drift erklärt p0/p1 (Mund komplett außerhalb der 202-px-Mask).
2. **Bbox-JSON-frame_count = 243, aber Sync.so behandelt Frames > requested.totalSec (216) als "no face"** → speziell für p2/p3 (deren Sprech-Fenster 3.89–8.83s liegt im Bereich Frame 93–212, eigentlich ok) aber die Pad-Frames 217–243 könnten den ASD-Konfidenz-Score so kippen, dass Sync.so aufgibt.
3. **Per-Pass tight-WAV vs. absolute Zeitachse-Mismatch.** `audio_tight` setzt `sourceTiming=relative` mit `output_offsets_sec` — wenn das Array leer/falsch ist, spielt der Compositor für jeden Turn den Pass-Output von 0 ab und zeigt für die hintere Hälfte der Szene den unanimierten Tail.

### Diagnoseschritte (read-only, in build-mode)
1. **ffprobe** auf Plate + alle 4 `output_url`s — Dauer, fps, w×h, ob audio im Pass-Output enthalten (Sync.so ersetzt Audio).
2. **1 Frame extrahieren** aus Plate und aus jedem Pass-Output bei Mitten-Timestamp des jeweiligen Speaker-Turns (z.B. p0 @ 1.2s, p1 @ 3.1s, p2 @ 5.3s, p3 @ 7.9s) → vergleichen, ob der Mund des Zielsprechers im Pass-Output bewegt vs. Plate, und ob unsere `coords` über dem korrekten Gesicht liegen.
3. **Bbox-JSON** für p0 & p3 herunterladen → Anzahl Einträge, Bbox-Bereich, schauen ob alle Frames dieselbe Bbox haben (statisch) oder gar leere Boxen.
4. **Render-Inputs prüfen**: das letzte `audio_tight.output_offsets_sec` Array in `dialog_shots->passes[*]` lesen und mit Segments-Timing abgleichen.
5. **Aktuelle Master-URL** in `composer_scenes` lesen und 1 Frame pro Sprecher-Turn rendern, um zu sehen welche Mask-Region greift.

### Was wir dann liefern
- Ein **kurzer Befund-Report** ("Bbox-System X drift, mask-radius Y reicht nicht für 4-Speaker Layout, …").
- Konkreter Fix-Vorschlag (z.B. dynamische Mask-Radien aus der Bbox-Größe, oder Bbox-Frames clampen auf `min(requested_total*fps, plate_frames)`, oder coords in echten Plate-Pixelraum reprojizieren) **mit `requires-approval=true`** — wir patchen erst nach deinem Go.

### Was wir **nicht** anfassen
- v153.8 Frame-Count-Fix bleibt.
- Auto-Detect bleibt aus.
- Sync-3 Doc-Strict Options bleiben unverändert.

Sag "Diagnose starten" und ich gehe die Schritte 1-5 im Build-Mode der Reihe nach durch, ohne vorher Code zu ändern.