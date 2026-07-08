## Befund

Das Problem besteht tatsächlich weiterhin, und der Screenshot passt zu den Live-Daten:

- Der letzte fehlgeschlagene Run (`scene_id=7a6c9417...`) wurde mit `generation_input_face_selection_invalid` abgelehnt.
- Die Dispatch-Logs zeigen weiterhin `canonical_lipsync_pipeline=v203_fullplate_sync3_bbox_only` und `video=.../p*-fullplate-...mp4`.
- Im aktuellen Code ist die v204-Markierung zwar gesetzt, aber zwei zentrale Stellen sind noch falsch:
  - `rawDispatchVideoUrl` nutzt für `speakers.length >= 2` weiterhin `passInputUrl` = Full-Plate.
  - Telemetrie setzt für N≥2 weiterhin `input_space='plate'`, `preclip_used=false`, `dispatch_video_kind='full_plate'`, `fullplate_bbox_only=true`.

Damit war der Rollback nur teilweise umgesetzt: BBox wird berechnet, aber Sync.so bekommt weiterhin die Full-Plate.

## Plan

1. **Dispatch-URL wirklich auf Preclip umstellen**
   - In `compose-dialog-segments/index.ts` `rawDispatchVideoUrl` so ändern, dass N≥2 nur noch `passPreclipUrl` verwendet.
   - Wenn bei N≥2 kein Preclip verfügbar ist, vor Sync.so hard-fail + Refund statt Full-Plate-Fallback.

2. **Rehost-Kind und Persistenz korrigieren**
   - `rehostPlate(... kind ...)` für N≥2 auf `preclip` setzen, wenn `usePassPreclip=true`.
   - `pass.input_url` bleibt danach der tatsächlich an Sync.so gesendete Preclip.

3. **Telemetrie korrigieren**
   - `dispatch_video_kind='preclip'` für N≥2.
   - `input_space='clip'` für N≥2.
   - `preclip_used=true` für N≥2.
   - `fullplate_bbox_only=false` bzw. entfernen/neutralisieren für v204.
   - `canonical_lipsync_pipeline='v204_preclip_bbox_clipspace'` beibehalten.

4. **Vor-Dispatch Guard ergänzen**
   - Direkt vor Payload-Build: Wenn `speakers.length >= 2` und `!usePassPreclip || !passPreclipUrl`, abbrechen.
   - Damit kann kein alter Full-Plate-Pfad mehr unbemerkt durchrutschen.

5. **Deploy + Verifikation**
   - `compose-dialog-segments` und `sync-so-webhook` deployen.
   - Danach Logs/DB prüfen: neue Dispatches müssen `video_url/preflight payload` mit `preclip`, `input_space='clip'`, `preclip_used=true`, `model='sync-3'`, `asd_mode='bounding_boxes_url'` zeigen.

## Erwartetes Ergebnis

Der nächste Multi-Speaker-Lip-Sync-Run sendet nicht mehr `p*-fullplate-...mp4` an Sync.so, sondern den Single-Face-Preclip pro Sprecherpass. Damit ist genau der v169/v204-Pfad aktiv, der die Full-Plate-Morphs und `generation_input_face_selection_invalid` vermeiden soll.