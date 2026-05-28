## Befund

- Ja: **HappyHorse läuft bei uns über Replicate** (`alibaba/happyhorse-1.0`).
- Für **Cinematic-Sync mit 2 Sprechern** wird HappyHorse aber inzwischen absichtlich blockiert und auf **Hailuo** umgestellt, weil HappyHorse als Master-Plate für Multi-Personen-Lip-Sync zu stark driftet.
- Der aktuelle Hänger ist nicht mehr HappyHorse selbst: Die betroffene Szene wurde bereits auf `ai-hailuo` migriert.
- Der eigentliche Fehler ist ein **Race im Webhook/Retroactive-Guard**:
  - Hailuo liefert den Clip erfolgreich zurück.
  - `compose-clip-webhook` setzt `clip_url`/`clip_status=ready`.
  - Danach ruft der Webhook `compose-dialog-scene` auf.
  - `compose-dialog-scene` sieht aber noch `clip_source=ai-happyhorse`, invalidiert den gerade fertigen Clip wieder und setzt `clip_status=pending`.
  - Ergebnis: UI bleibt bei Clip-Generierung hängen; Lip-Sync startet nicht zuverlässig.

## Plan

1. **Retroactive HappyHorse-Guard korrigieren**
   - `compose-dialog-scene` darf einen fertigen Hailuo-Master nicht mehr wegwerfen, nur weil `clip_source` noch stale `ai-happyhorse` ist.
   - Wenn bereits ein valider `clip_url` existiert und die aktuelle Prediction vom Hailuo-Neurender kommt, soll die Funktion direkt den Dialog-Shot-State erzeugen statt erneut zu invalidieren.

2. **Webhook atomar machen**
   - `compose-clip-webhook` soll bei Cinematic-Sync nach erfolgreichem Clip nicht nur `clip_url` und `clip_status` setzen, sondern auch sicherstellen:
     - `clip_source = 'ai-hailuo'`, wenn HappyHorse zuvor für Multi-Speaker migriert wurde
     - `lip_sync_status = 'pending'`
     - `twoshot_stage = 'master_clip'`
   - Damit liest `compose-dialog-scene` keinen alten HappyHorse-State mehr.

3. **Kickstart-Sweep gegen Endlosschleifen härten**
   - `poll-dialog-shots` soll Szenen, bei denen `compose-dialog-scene` mit `missing_audio_plan` oder einem Guard-Fehler scheitert, sichtbar auf `failed`/`clip_error` setzen statt jede Minute denselben unsichtbaren Start zu wiederholen.
   - Für Szenen mit fertigem Audio-Plan und fertigem Clip soll der Sweep weiterhin Lip-Sync starten.

4. **Betroffene Szene reparieren**
   - Die aktuelle Szene wieder auf den fertigen Master-Zustand bringen, falls der Webhook ihn gerade gelöscht hat.
   - Danach `compose-dialog-scene` einmal direkt anstoßen, damit `dialog_shots` erzeugt werden und `poll-dialog-shots` Sync.so startet.

5. **Validierung**
   - Logs prüfen: kein erneutes „HappyHorse invalidating master“ nach Hailuo-Erfolg.
   - Datenbank prüfen: Szene geht von `ready + pending` zu `dialog_shots.version=4` und dann `lip_sync_status=running/stitching/done`.
   - UI sollte dann nicht mehr bei „Clips“ hängen, sondern den Lip-Sync-Schritt anzeigen.