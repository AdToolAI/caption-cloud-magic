## Problem
Der Screenshot bestätigt den nächsten Engpass: v159 erkennt zwar einen Mundanker (`mouth_used=true`), erzeugt aber eine zu kleine Box (`area_pct=0.14`). Der aktuelle Sanity-Guard blockt korrekt, weil Sync.so laut Doku `bounding_boxes` als Face-Detection-Box erwartet, nicht als reine Lippen-/Mund-Mini-Region. Genau diese Mini-Region kann Morphs/No-Lipsync auslösen.

## Plan
1. **Sync-3 Box-Strategie korrigieren**
   - Für `sync-3` wieder eine echte, enge Gesicht-Box senden: Stirn/Haar bis Kinn, Ohr-zu-Ohr.
   - Den Mund-Landmark nur noch als Qualitäts-/Zuordnungsanker verwenden, nicht als Mittelpunkt einer winzigen Lippenbox.
   - Zielgröße: realistische Head/Face-Box um ca. `0.4%–3%` der Plate-Fläche statt `0.14%`.

2. **Mouth-Gating beibehalten**
   - Multi-Speaker bleibt fail-closed, wenn kein Mouth-Landmark vorhanden ist.
   - Damit senden wir nur Boxen, deren Sprecher eindeutig per Mouth-Landmark zugeordnet wurde.

3. **Doc-strict Sync-3 Payload bereinigen**
   - `sync-3` bleibt aktiv, kein Wechsel auf `lipsync-2-pro`.
   - `active_speaker_detection.bounding_boxes_url` bleibt der Primärpfad.
   - Keine `auto_detect:true`-Fallbacks.
   - Falls noch nicht effektiv durch Sanitizer entfernt, sicherstellen, dass verbotene `sync-3` Optionen nicht im finalen Payload landen.

4. **Geometry Gate an echte Face-Boxes anpassen**
   - Den Sanity-Bereich so lassen/leicht präzisieren, dass echte Gesichtsboxen passieren und Mini-Mouth-Boxes weiterhin blockiert werden.
   - Der Fehler `bbox_geometry_insane:area_pct=0.14` soll danach nicht mehr bei korrekt erkannter Face-Box auftreten.

5. **Cache/Scene resetten**
   - Stale `plate_face_cache` und `dialog_shots.plate_identity` für die aktuell fehlgeschlagene Scene `8a0baf67-2261-4ba3-8dc7-e511dcee9e59` invalidieren, damit v160 nicht alte Mouth-Box-Daten wiederverwendet.

6. **Deploy + Verifikation**
   - `compose-dialog-segments` deployen.
   - In Logs prüfen: `version=v160`, pro Pass `v160_sync3_face_box`, `mouth_used=true`, `area_pct >= 0.20` und `v147_BBOX_URL_PRIMARY` statt Hard-Fail.

## Erwartetes Ergebnis
Die Pipeline nutzt weiterhin `sync-3`, aber mit Sync.so-konformen Face-Bounding-Boxes. Dadurch sollte der direkte Fehler verschwinden und die Morphs sollten deutlich reduziert werden, weil Sync.so wieder ein vollständiges Gesicht statt einer winzigen Lippenregion targetet.