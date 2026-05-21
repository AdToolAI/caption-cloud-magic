## Befund

Do I know what the issue is? Ja.

Der aktuelle Fehler ist nicht mehr die FaceMap/Koordinaten-Erkennung. Die wurde erfolgreich erzeugt:

- `compose-dialog-scene` loggt: `faceMap rebuilt: 2 faces, identities=matthew-dusatko,samuel-dusatko`
- Die aktiven Szenen haben `dialog_shots.version = 2`
- Alle Shots haben `target_coords`
- Aber alle Shots bleiben auf `pending` und bekommen keinen `sync_job_id`

Der eigentliche Blocker sitzt jetzt im neuen Poller:

- `poll-dialog-shots` antwortet bei direktem Test mit `500 {"error":"missing_sync_key"}`
- Die alte Pipeline liest den vorhandenen Secret-Namen `SYNC_API_KEY`
- Die neue Pipeline sucht aber nur `SYNC_SO_API_KEY` oder `SYNCSO_API_KEY`
- Ergebnis: Der Poller startet nie den ersten Sync.so Job, deshalb bleibt der Fortschritt bei Lip-Sync hängen.

## Plan

1. **Secret-Namen in `poll-dialog-shots` korrigieren**
   - `poll-dialog-shots/index.ts` so ändern, dass es zuerst `SYNC_API_KEY` liest.
   - Danach als Fallback weiterhin `SYNC_SO_API_KEY` und `SYNCSO_API_KEY` unterstützen.
   - Fehlermeldung erweitern, damit künftig klar ist, welche Env-Namen geprüft wurden.

2. **Poller-Konfiguration stabilisieren**
   - In `supabase/config.toml` einen Block für `poll-dialog-shots` ergänzen:
     - `verify_jwt = false`, damit Cron, interne Kicks und manuelle Rescue-Calls zuverlässig laufen.
     - passendes Timeout setzen, weil der Poller Sync.so dispatchen und Status abfragen muss.
   - Optional auch `compose-dialog-scene` explizit mit Timeout konfigurieren, falls der FaceMap-Rebuild länger dauert.

3. **Deployment und direkter Funktionstest**
   - `poll-dialog-shots` neu deployen.
   - Direkten Test gegen die aktuell hängende Szene ausführen.
   - Erwartung: Shot 0 wechselt von `pending` zu `lipsyncing` und bekommt einen `sync_job_id`.

4. **Aktive hängende Szenen fortsetzen**
   - Kein kompletter Reset nötig, weil die Szenen bereits korrekt in `dialog_shots.status = queued` stehen.
   - Nach dem Deploy den Poller für die hängenden Szenen erneut anstoßen.
   - Danach prüfen:
     - `shot_statuses` enthält mindestens `lipsyncing`
     - `sync_job_ids` ist nicht mehr leer
     - später wechseln Shots sequenziell zu `ready`

5. **Fallback nur falls Sync.so danach ablehnt**
   - Wenn nach dem Secret-Fix ein echter Sync.so API-Fehler kommt, prüfe ich als Nächstes Payload-Kompatibilität:
     - `segments_secs` vs. neue `segments` API
     - `active_speaker_detection.coordinates`
     - `frame_number`-Bezug zur Quelle
   - Das ist aber erst der nächste Schritt; aktuell wird Sync.so gar nicht erreicht.

## Dateien

- `supabase/functions/poll-dialog-shots/index.ts`
- `supabase/config.toml`

## Erwartetes Ergebnis

Die neue Dialog-Shot-Pipeline kann den vorhandenen Sync.so API-Key wieder lesen, der Poller dispatcht den ersten Lip-Sync-Turn, und die Szene verlässt den festhängenden `pending`-Zustand.

<presentation-actions>
  <presentation-open-history>View History</presentation-open-history>
</presentation-actions>

<presentation-actions>
<presentation-link url="https://docs.lovable.dev/tips-tricks/troubleshooting">Troubleshooting docs</presentation-link>
</presentation-actions>