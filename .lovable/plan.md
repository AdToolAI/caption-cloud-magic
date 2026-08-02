## Kurze Antwort

Ja — bis einschließlich Plate-Fertigstellung läuft es jetzt sauber, danach hängt es weiter am Bridge-Trigger.

Verifiziert in diesem Turn:
- `compose-dialog-segments` (61), `sync-so-webhook` (22), `render-sync-segments-audio-mux` (12), `lipsync-watchdog` (8) enthalten weiterhin ausschließlich Legacy-Schreibstellen; `pipeline_state` / `transitionScene` kommt in keiner dieser Dateien vor.
- Der DB-Trigger `composer_scene_state_bridge` spiegelt in beide Richtungen. Der Lip-Sync-Teil funktioniert deshalb weiter, ist aber noch nicht validiert: veraltete Callbacks können den Zustand dort weiterhin ohne Run-/Generations-Prüfung setzen.

## Eine echte Lücke, die dabei aufgefallen ist

Der Bridge-Trigger zieht die Legacy-Spalten **nur** nach, wenn im selben Statement keine Legacy-Spalte (inkl. `clip_url`) verändert wurde. Zwei in Welle B migrierte Stellen in `compose-video-clips` (Upload-Pfad und Stock-Pfad) schreiben `clip_url` und `pipeline_state: 'plate_ready'` in **einem** Statement — dort bleibt `clip_status` auf dem alten Wert stehen, während `pipeline_state` bereits `plate_ready` ist. Legacy-Leser sehen dann einen veralteten Status.

## Plan — Welle C (Dialog-/Lip-Sync-Pfad)

### C0 — Bridge-Lücke schließen (zuerst, klein)
- In `compose-video-clips` Upload-/Stock-Pfad: `clip_url` schreiben, Übergang danach per `transitionScene(..., 'plate_ready')` — zwei Statements, wie im Webhook.
- Regel dokumentieren: Nutzdaten und Zustandsübergang nie im selben Update.

### C1 — `compose-dialog-segments`
- Audio-/Dispatch-Kette auf `transitionScene` umstellen: `audio_ready` → `lipsync_dispatched`.
- Vorbedingung nicht mehr über `twoshot_stage`-Strings, sondern über `canDispatchLipsync()` aus `_shared/scene-state.ts`.
- Jeder Übergang mit `runId` + `generation`; abgelehnte Übergänge als `v385_stale_transition` loggen statt still zu ignorieren.

### C2 — `sync-so-webhook`
- `lipsync_running` → `lipsync_muxing` → `complete`, Fehlerpfade über `transitionScene(..., 'failed')`.
- Verdict-Gate (Passthrough/Static) bleibt inhaltlich unverändert, schreibt aber nur noch `clip_error` als Anzeigetext.

### C3 — `render-sync-segments-audio-mux` und `compose-stitch-and-handoff`
- Mux-Start → `lipsync_muxing`, Mux-Erfolg → `complete`, Mux-Fehler → `failed`.

### C4 — `report-lipsync-motion-probe`, `compose-video-assemble`
- Nur noch Telemetrie bzw. `failed`-Übergang; keine direkten Stage-Strings mehr.

### Technische Details
- Alle Übergänge laufen über die vorhandene RPC `composer_scene_transition` (Run-/Generations-Prüfung).
- Legacy-Spalten werden in Welle C ausschließlich noch vom Trigger gepflegt.
- Keine Schema-Änderung nötig; der Reject-Trigger kommt erst in Welle E.

### Prüfung nach Welle C
- Ein realer Dialoglauf mit 2 und mit 4 Sprechern.
- Kontrolle, dass `pipeline_state` und Legacy-Spiegel zu jedem Zeitpunkt konsistent sind (`composer-reset-selftest`).
