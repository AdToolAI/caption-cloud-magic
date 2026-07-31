## Ziel

Lip-Sync soll auch bei bewegten Charakteren treffen — ohne die bestehende, stabile Statik-Pipeline zu gefährden.

## Ist-Zustand (verifiziert)

- `compose-dialog-segments` baut die Sync.so-Boxen aus **einer** Plate-Messung: `new Array(totalFrames).fill(box)`, nur Nicht-Sprech-Frames sind `null`.
- `_shared/pass-face-preclip.ts` rendert einen **fixen** quadratischen Crop; das Ergebnis wird später an genau dieser Stelle zurückgeblendet.
- `preclip_crop` ist ein geteilter Vertrag: `render-sync-segments-audio-mux` (Overlay-Rect), `sync-so-webhook` (`outputSize`-Achsenprüfung), `DialogStitchVideo.tsx` (Maske + Silent-Face-Freeze-Tiles aus Frame 0), `report-lipsync-motion-probe` (`havePreclipCrop`).
- Prompts in `compose-video-clips` erzwingen heute „LOCKED CAMERA … position and size stay identical", halten Bewegung also künstlich klein.

## Warum nicht einfach „größerer Crop"

Ein aufgeweiteter Crop würde das Overlay-Rechteck vergrößern und damit im Mux mehr Hintergrund/Nachbargesicht überschreiben; zusätzlich stammen die Silent-Face-Tiles aus Frame 0 und passen bei bewegtem Körper nicht mehr zum Plate darunter (Geisterkanten). Deshalb: bei echter Bewegung **kein Crop-Overlay**, sondern Vollplate mit getrackten Boxen.

## Plan

### 1. Motion-Messung (neu, rein additiv)
`supabase/functions/_shared/face-motion-track.ts`:
- Sampelt das gerenderte Plate (z. B. alle 0,25 s), Gesichtserkennung über die bereits genutzte AWS-Rekognition-Route.
- Slot-Zuordnung per Nearest-Center gegen die bestehende, gelockte Identity-Map (kein neues Matching-Verfahren, keine Konkurrenz zu v320/v326).
- Liefert pro Speaker eine Trajektorie `[{t, bbox}]` plus `max_drift_pct` und `max_scale_delta`.
- Jeder Fehler (Rekognition down, zu wenige Samples, Slot nicht eindeutig) → `null` zurück, Aufrufer fällt exakt auf den heutigen Pfad zurück.

### 2. Zwei Klassen statt drei
- **static** (Drift < 6 % Bildbreite, Scale-Delta < 12 %): Pipeline bleibt **bitgleich** wie heute — Preclip, fixe Box, Overlay, Freeze-Tiles.
- **moving**: getrackter Vollplate-Pfad (Schritt 3). Kein Preclip, kein Overlay-Rect, keine Freeze-Tile-Problematik.

### 3. Getrackter Vollplate-Pfad
- `uploadBoundingBoxesJson` erhält optional die Trajektorie und schreibt interpolierte Boxen pro Frame (`null` außerhalb der Voiced-Windows bleibt unverändert — das ist der v201-Schutz gegen Morph-Bleed).
- Dispatch über die vorhandene Variante `bbox-url-pro` mit `preclip_url = null`, `preclip_crop = null`.
- Mux nimmt für diese Passes den bereits existierenden Vollplate-Zweig; es wird kein neuer Compositing-Modus gebaut.

### 4. Anpassungen an den Vertragskonsumenten
- `sync-so-webhook`: Achsenprüfung `expectedPreclipAxis` nur noch anwenden, wenn `bbox_mode = 'static'`; für `tracked` greift die Vollplate-Prüfung.
- `render-sync-segments-audio-mux`: Der Hard-Fail „Multi-Speaker ohne preclip_crop" wird auf `bbox_mode = 'static'` eingegrenzt, damit getrackte Passes ihn nicht auslösen. Mischbetrieb (Speaker A static + Speaker B tracked in derselben Szene) wird explizit unterstützt: statische Passes overlayen wie bisher, getrackte kommen als Vollplate-Layer.
- `report-lipsync-motion-probe`: NOOP + `bbox_mode = 'static'` + `motion_class = moving` → sofort auf den getrackten Pfad eskalieren statt dieselbe fixe Box zu wiederholen. Ladder-Länge bleibt gleich (kein zusätzlicher Kostenpfad).
- `DialogStitchVideo.tsx`: Freeze-Tiles nur noch für Slots mit `bbox_mode = 'static'` erzeugen.

### 5. Prompt-Lockerung (kontrolliert)
In `compose-video-clips` bleibt das Kamera-Lock unverändert. Nur die Subjekt-Klausel wird von „position and size stay identical" zu „bleibt durchgehend vollständig im Bild, Gesicht und Mund frei sichtbar, keine Positions-Swaps" umformuliert. Kamerabewegung bleibt verboten (sonst bricht die Plate-Invariante gegen den Anchor).

### 6. Diagnose
Neue Pass-Felder: `motion_class`, `max_drift_pct`, `track_samples`, `bbox_mode`. Logs mit Prefix `v327_motion_track`, damit sich Regressionen von den Statik-Fällen trennen lassen.

## Risiken und wie sie abgedeckt sind

| Risiko | Abdeckung |
| --- | --- |
| Regression bei heutigen statischen Szenen | Klasse `static` durchläuft unveränderten Code; Tracking-Fehler fallen ebenfalls dorthin zurück |
| Vollplate-Pfad trifft bei kleinen Gesichtern schlechter als Preclip | Face-Share-Floor bleibt aktiv; unterschreitet ein bewegter Speaker ihn, wird die Szene wie heute geblockt statt still falsch gerendert |
| Overlay/Freeze-Tile-Artefakte | Entfallen im getrackten Pfad, weil dort nicht overlayt wird |
| Zusätzliche Kosten | 8–20 Rekognition-Detects pro Szene, kein zusätzlicher Lambda-Render; statische Szenen unverändert |
| Mehr Bewegung durch gelockerten Prompt bei Modellen ohne Tracking-Bedarf | Prompt-Änderung erst nach Verifikation von Schritt 1–4 aktivieren, damit sie separat rückrollbar ist |

## Technische Details

Betroffen: `_shared/face-motion-track.ts` (neu), `compose-dialog-segments/index.ts`, `_shared/pass-face-preclip.ts`, `sync-so-webhook/index.ts`, `render-sync-segments-audio-mux/index.ts`, `report-lipsync-motion-probe/index.ts`, `compose-video-clips/index.ts`, `src/remotion/templates/DialogStitchVideo.tsx`, plus Migration für die vier Diagnose-Spalten.
