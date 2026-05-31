## Befund

Die aktuelle Szene kommt nicht einmal bei `compose-video-clips` an: In den Network-/Backend-Logs gibt es keinen aktuellen Aufruf. In der Datenbank steht die sichtbare 1-Sprecher-Szene weiterhin auf `pending` mit:

```text
clip_source = ai-happyhorse
engine_override = cinematic-sync
clip_error = auto-reset: talking_head_master_invalid_for_cinematic_sync
replicate_prediction_id = null
reference_image_url = null
twoshot_stage = null
```

Das heißt: Es steckt noch ein zweiter Fehler vor bzw. direkt am Start der Pipeline. Zusätzlich bleibt ein alter Auto-Reset-Marker auf genau dieser 1-Charakter-Szene hängen.

## Plan

1. **1-Charakter-Pipeline klar trennen**
   - Für `cinematic-sync` mit genau 1 Sprecher einen eigenen stabilen Startpfad einbauen.
   - Keine 2-Charakter-/Multi-Speaker-Audits anfassen.
   - 2+ Sprecher bleiben exakt auf der bestehenden Pipeline.

2. **HappyHorse als 1-Sprecher-Startproblem entschärfen**
   - Für 1 Sprecher nicht mehr mit `ai-happyhorse` starten, solange diese Szene durch den alten Talking-Head/Auto-Reset-Wächter blockiert werden kann.
   - 1-Sprecher `cinematic-sync` defensiv auf `ai-hailuo` als Master-Plate routen.
   - Der Dialog-/Lip-Sync-Teil bleibt danach wie gehabt Sync.so-basiert.

3. **Auto-Reset-Schleife korrigieren**
   - `useTwoShotAutoTrigger` darf 1-Sprecher-Szenen mit `auto-reset: talking_head_master_invalid_for_cinematic_sync` nicht dauerhaft in `pending` liegen lassen.
   - Wenn `clip_url` bereits gelöscht ist, muss der Marker beim nächsten Start ignoriert/gelöscht werden.
   - Der Reset für echte alte Talking-Head-Master bleibt erhalten.

4. **Frontend-Startpfad absichern**
   - `useSceneGenerate` bekommt eine harte Vorprüfung: Wenn Projekt/Scene nicht persistiert werden können, erscheint ein sichtbarer Fehler statt stillem Rücksprung.
   - Direkt vor `supabase.functions.invoke('compose-video-clips')` wird der DB-Status auf `generating` gesetzt und `clip_error` gelöscht, damit die UI nicht wieder auf `pending` zurückspringt.

5. **Backend-Start sichtbar machen**
   - `compose-video-clips` löscht bei Start alte `clip_error`-Marker.
   - Für 1-Sprecher `cinematic-sync` wird sofort `twoshot_stage='anchor'` oder `master_clip` gesetzt, bevor Anchor/Provider laufen.
   - Wenn Portrait-Auflösung fehlschlägt, wird ein klarer Fehler gespeichert statt stiller Abbruch.

6. **Aktuelle Testszene resetten**
   - Nur die aktuelle Projekt-Szene `b9cb19f6-ea8b-41e9-b233-f6b1c9b94179` zurücksetzen:
     - `clip_status='pending'`
     - `clip_error=null`
     - `clip_source='ai-hailuo'`
     - `reference_image_url`, `replicate_prediction_id`, `twoshot_stage`, Lip-Sync-Felder leeren
   - Keine 2-Charakter-Szenen verändern.

7. **Verifikation**
   - Nach Deployment einmal gezielt die 1-Sprecher-Szene starten.
   - Erfolgs-Kriterien:
     - Network/Backend-Log zeigt `compose-video-clips`.
     - DB wechselt sofort auf `generating`.
     - `clip_error` bleibt leer.
     - `twoshot_stage` wird gesetzt.
     - Danach `reference_image_url` oder `replicate_prediction_id` erscheint.

## Nicht anfassen

- Keine Änderungen an 2-Charakter Face-/Identity-/Human-Audits.
- Keine Änderung an Multi-Speaker Dialog-Shot-Pipeline.
- Keine 3-Charakter-Logik jetzt.

<presentation-actions>
  <presentation-open-history>View History</presentation-open-history>
</presentation-actions>

<presentation-actions>
<presentation-link url="https://docs.lovable.dev/tips-tricks/troubleshooting">Troubleshooting docs</presentation-link>
</presentation-actions>