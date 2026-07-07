## Befund

Du hast sehr wahrscheinlich recht: Der neueste Run verwendet zwar bereits `v201_id_bbox_sync3` und `bounding_boxes_url`, aber der aktive Code rendert für Multi-Speaker weiterhin per-pass **Single-Face-Preclips** und schickt dann `bounding_boxes_url` im **Crop-Space** an Sync. Das ist nicht der „reine“ Full-Plate-Bounding-Boxes-Pfad.

Außerdem zeigen die letzten 48h viele ältere Dispatches ohne v201-Metadaten; die zwei neuesten Szenen haben v201, aber `composer_scenes.dialog_shots` persistiert den Pipeline-Marker nicht. Dadurch ist im UI/DB schwer sichtbar, welcher Pfad wirklich lief.

## Ziel von Teil B / v203

Multi-Speaker Dialog darf nicht mehr über Preclip/Crop-Overlay laufen. Für N≥2 gilt strikt:

```text
Master Plate MP4
+ per-speaker full-plate bounding_boxes_url
+ sync-3
+ tight turn audio
=> Sync output full-plate / or mux-safe output
```

Keine per-pass Face-Preclips, kein Crop-Space-BBox, kein Auto-Detect, kein coords/lipsync-2-Fallback.

## Umsetzung

1. **Multi-Speaker Preclip vollständig deaktivieren**
   - In `compose-dialog-segments` wird `v161PreclipEligible` für `speakers.length >= 2` hart auf `false` gesetzt.
   - Bereits gecachte `pass.preclip_url`, `preclip_crop`, `preclip_frame_count` werden für N≥2 vor Dispatch ignoriert/gelöscht.
   - N=1 bleibt unverändert, damit wir nicht unnötig Solo-Szenen riskieren.

2. **Full-Plate-BBox als einziger N≥2 Dispatch-Pfad**
   - Für N≥2 muss `passInputUrl` immer die Master-Plate sein, nicht ein Preclip.
   - `bounding_boxes_url` wird ausschließlich aus plate-nativen Boxen gebaut.
   - Wenn plate-native Box, Mund-Landmark oder Framecount fehlt: fail-closed + Refund statt Fallback.

3. **Legacy-Varianten wirklich blocken**
   - `coords-pro`, `coords-pro-box`, `sync3-coords`, `coords-pro-lp2pro`, `auto-*` werden für N≥2 nicht mehr als aktive Dispatch-Varianten zugelassen.
   - NOOP/Failure eskaliert nicht mehr auf andere Varianten; es wird transparent failed/refunded mit Diagnose.
   - `lipsync-2-pro` bleibt im Dialog-Pfad unbenutzt.

4. **Persistente Pipeline-Telemetrie**
   - `dialog_shots.canonical_lipsync_pipeline = 'v203_fullplate_sync3_bbox_only'`
   - Pro Pass Metadaten: `input_space='plate'`, `preclip_used=false`, `asd_mode='bounding_boxes_url'`, `model='sync-3'`, `character_id`, `scene_assets_bound=true/false`.
   - `syncso_dispatch_log.meta` erhält dieselben Marker, damit wir nach jedem Run eindeutig prüfen können.

5. **Safety Query / Live-Verifikation vorbereiten**
   - Nach Deploy prüfen wir per Datenbankabfrage:
     - keine N≥2 Dispatches mit `preclip_used=true`
     - alle N≥2 Dispatches `model=sync-3`
     - alle N≥2 Dispatches `asd_mode=bounding_boxes_url`
     - keine non-bbox Retry-Varianten

## Nicht in diesem Schritt

- Keine neue Face-Track-Preclip-Architektur.
- Keine UI-Änderungen.
- Keine Briefing-Analyse-Erweiterung.
- Keine Reaktivierung von lipsync-2/lipsync-2-pro.

## Erwartetes Ergebnis

Der nächste Multi-Speaker-Testlauf ist eindeutig prüfbar: entweder er läuft durch den reinen Full-Plate-Bounding-Boxes-Pfad, oder er bricht vor Sync sauber ab und refundet. Es darf kein stilles Zurückfallen auf Preclip, Crop-Overlay, Auto-Detect oder Legacy-Retry mehr geben.