# V503 — 6/6 Audio-Mux Contract Repair

## Verifizierter Befund

Die aktuelle Szene `be60d106…` hat **6/6 fertige Provider-Pässe**, hängt aber weiterhin in `audio_muxing`. Es fehlt sowohl `audio_mux.render_id` als auch `dispatched_at`; der einmalige V501-Re-Dispatch wurde bereits markiert.

Der Mux-Aufruf erreicht die Funktion, endet jedoch mit HTTP 500. Der belegte Blocker liegt im Muxer: Er prüft die historischen `pass.coords` gegen `preclip_crop`. Bei Pass 0 liegen diese Legacy-Koordinaten außerhalb, deshalb ersetzt der Muxer den korrekten Crop durch einen `faceMask`-Fallback. Direkt danach verbietet der v205-Guard genau diesen Fallback bei Mehrsprecher-Szenen.

V502 korrigiert die Koordinaten für **neue Provider-Dispatches**, aber die bereits fertige Szene trägt weiterhin ihre historischen `pass.coords`. Diese Werte dürfen beim finalen Mux nicht erneut zur Autorität über den bereits gerenderten Preclip werden.

## Umsetzung

1. **Mux-Vertrag korrigieren**
   - Bei vorhandenem, gültigem `preclip_crop` immer diesen persistierten Transform für die Rückprojektion des fertigen Preclip-Outputs verwenden.
   - Historische `pass.coords` nur noch als Telemetrie behandeln; außerhalb liegende Legacy-Koordinaten lösen keinen `faceMask`-Fallback mehr aus.
   - Der v205-Guard bleibt unverändert hart: Ein tatsächlich fehlender/ungültiger `preclip_crop` blockiert den Mehrsprecher-Mux weiterhin.

2. **Regressionstest ergänzen**
   - Fall der aktuellen Szene: gültiger Crop + Legacy-Coords außerhalb → Crop-Overlay, kein FaceMask, Mux zulässig.
   - Fehlender/ungültiger Crop → FaceMask erkannt und weiterhin durch v205 blockiert.

3. **Deploy und gezielte Wiederaufnahme**
   - Nur `render-sync-segments-audio-mux` deployen.
   - Den vorhandenen Mux für `be60d106…` erneut anstoßen; keine neuen Sync-Provider-Calls und keine zusätzlichen Lip-Sync-Kosten.
   - Bis zum terminalen Zustand prüfen: `render_id` gesetzt, Render abgeschlossen, `clip_url` aktualisiert und `lip_sync_status` nicht mehr `audio_muxing`.

## Abgrenzung

- Keine Änderung an Face-/Mundtracking, ASD, Provider-Payload, Gates, Schwellenwerten oder Zustandsmaschine.
- Kein neuer S01-Canary und keine Wiederholung der sechs Lip-Sync-Pässe.
- Der Fix betrifft ausschließlich die Koordinaten-Autorität beim finalen Compositing.