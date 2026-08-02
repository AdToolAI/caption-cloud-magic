## Ziel: Diese beiden Fehler werden strukturell unmöglich

### Fehler 1
Nach „Clip neu generieren“ leben alte Clip-, Preclip-, Lip-Sync-, Render- oder Webhook-Jobs weiter und schreiben später in den neuen Lauf.

### Fehler 2
Eine fehlgeschlagene Szene startet oder продолжает trotzdem Audio-Prep/Lip-Sync/Provider/Mux und der Fortschrittsbalken läuft weiter.

## Bestätigte Ursache im letzten Run

- Der konkrete Preclip ist mit **`supabaseAdmin is not defined`** fehlgeschlagen.
- Zu diesem Zeitpunkt waren bereits andere Sync.so-Pässe gestartet.
- `compose-dialog-segments` prüft am Server-Eingang aktuell nicht vollständig `clip_status`, `clip_error` und `active_run_id`.
- Alte Sync.so- und Render-Callbacks sind nicht lückenlos an Generation + Run-ID gebunden.
- Mehrere Start-/Recovery-Pfade können terminale Zustände wieder auf `pending/running` setzen.
- Die Szene endete deshalb inkonsistent mit `clip_status='generating'`, aber gleichzeitig `clip_error` und `dialog_shots.status='failed'`.

## Umsetzung

### 1. „Neu generieren“ wird eine einzige atomare Serveroperation

Jeder Button und jeder interne Startpfad verwendet ausschließlich `composer-start-scene-generation`.

Unter einer Datenbanksperre geschieht in dieser Reihenfolge:

1. Alten Run terminal als `superseded` markieren.
2. Provider-Cancel für sämtliche bekannten Clip- und Lip-Sync-Jobs auslösen.
3. Alle lokalen aktiven Jobs, Dispatch-Logs, Locks und Renderzuordnungen des alten Runs tombstonen.
4. Alle alten Szenenartefakte löschen:
   - Master-Clip
   - Anchor/Reference-Ausgaben des Laufs
   - Preclips
   - Face-/Tracking-Dateien
   - Voiceover-/Pass-Audio des Laufs
   - Lip-Sync-Ausgaben
   - Mux-/Stitch-Ausgaben
5. Abgeleitete Felder in `audio_plan`, `dialog_shots`, Job-IDs und Fehlerstatus entfernen.
6. Erst danach neue `generation` und neue `run_id` erzeugen.
7. Nur wenn der vollständige Teardown erfolgreich war, darf der neue Clip dispatcht werden.

Bei Teardown-/Cancel-Fehler: **kein neuer Job, keine Abbuchung, klare Fehlermeldung**.

### 2. Run-ID und Generation auf jeden Job schreiben

Die Tabellen/Datensätze für Clip-Attempts, Sync.so-Dispatches, Preclips und Remotion-Renders erhalten verbindlich:

- `scene_id`
- `run_id`
- `generation`
- `status`
- `superseded_at`

Jeder ausgehende Provider-Request und jede Webhook-URL trägt Run-ID + Generation. Ein Callback darf nur schreiben, wenn:

```text
callback.run_id == scene.active_run_id
AND callback.generation == scene.plate_generation
AND run.status == 'active'
```

Andernfalls wird er protokolliert und ohne Zustandsänderung mit `ignored_stale` beendet. Damit kann ein alter Job selbst dann nichts beschädigen, wenn der externe Provider ihn nicht rechtzeitig abbrechen konnte.

### 3. Datenbank erzwingt „nur ein aktiver Run“

- Pro Szene darf exakt ein aktiver Run existieren.
- Neue Run-Übernahme invalidiert den bisherigen Run atomar.
- Job-/Webhook-Statusübergänge laufen über abgesicherte Datenbankfunktionen mit Compare-and-Set auf Run-ID und Generation.
- Direkte Statusschreibweisen, die einen superseded/failed Run wieder auf `running` setzen könnten, werden entfernt.

### 4. Globaler serverseitiger Terminal-Guard

Eine gemeinsame Guard-Funktion wird vor **jedem** Schritt verwendet:

- Audio-Prep
- Dialog-Dispatch
- Preclip-Erzeugung
- Sync.so-Aufruf
- Retry/Advance
- Motion-Probe
- Mux/Stitch
- Webhook-Schreibzugriff

Weiterarbeit ist nur erlaubt, wenn:

```text
clip_status == 'ready'
clip_error ist leer oder ausdrücklich nur ein Recovery-Marker
lip_sync_status nicht failed/canceled
scene.active_run_id == request.run_id
plate_ready_generation == plate_generation
run.status == 'active'
```

Jeder harte Szenenfehler stoppt sofort den gesamten Run.

### 5. Fehler atomar auf die ganze Szene anwenden

Eine zentrale `fail_scene_run`-Routine:

- setzt Run auf `failed`
- setzt Szene/Lip-Sync/Dialog-Stufe konsistent terminal
- beendet alle offenen Pass-/Preclip-/Renderjobs
- gibt Locks und Provider-Slots frei
- storniert Providerjobs bestmöglich
- erstattet Credits genau einmal
- verhindert danach jeden weiteren Dispatch oder Callback-Write

Der erste harte Fehler gewinnt. Parallele Pässe dürfen den Zustand anschließend nicht mehr ändern.

### 6. Automatisches Wiederbeleben entfernen

- `v100 auto-reset-stale-failed` wird entfernt.
- Watchdog, Auto-Trigger und Recovery dürfen nur nichtterminale Wartezustände reparieren.
- `failed`, `canceled` und `superseded` bleiben terminal.
- Nur ein expliziter Klick des Nutzers erzeugt einen komplett neuen Run.

### 7. Konkreten Crash reparieren

Die undefinierte Referenz `supabaseAdmin` im Preclip-Pfad wird durch den vorhandenen authentifizierten Backend-Client ersetzt bzw. korrekt injiziert. Zusätzlich wird dieser Pfad durch einen Test abgedeckt, damit derselbe Boot-/Scope-Fehler nicht erneut deployt werden kann.

### 8. Sämtliche Bypass-Startpfade schließen

Alle direkten Aufrufe von `compose-video-clips` aus SceneCard, ClipsTab, FaceMapReview, AnchorPreview und DialogStudio werden auf den zentralen Start-Endpunkt umgestellt. Ein direkter Dispatch ohne vorher erworbene Run-ID wird serverseitig abgelehnt.

### 9. Fortschrittsanzeige sofort stoppen

- Bei `failed/canceled/superseded` werden alle aktiven UI-Phasen beendet.
- Persistierter Fortschritt wird gelöscht.
- Alte Passdaten dürfen keine laufende Lip-Sync-Anzeige erzeugen.
- Der Kunde sieht nur eine kurze verständliche Fehlermeldung und „Neu rendern“; technische Details bleiben in Logs.

## Verbindliche Regressionstests

1. Clipfehler vor Lip-Sync → **0 Sync.so-/Preclip-/Mux-Dispatches**.
2. Fehler während paralleler Preclips → alle Geschwisterjobs werden gestoppt; kein weiterer Provideraufruf.
3. „Neu generieren“ bei laufendem Clip → alter Run superseded, alter Callback wirkungslos.
4. „Neu generieren“ bei laufendem Sync.so → Provider-Cancel + Slotfreigabe + alter Webhook wirkungslos.
5. Alter Remotion-Webhook nach Neustart → `ignored_stale`, keine Änderung der Szene.
6. Watchdog/Auto-Trigger auf failed/superseded → kein Neustart.
7. Teardown schlägt fehl → kein neuer Run und keine Kosten.
8. Zwei schnelle Klicks → genau ein aktiver Run.
9. Preclip-Exception → konsistenter terminaler Zustand + einmalige Erstattung + gestoppter Balken.
10. Erfolgreicher bewusster Neustart → frische Run-ID, frische Generation, keine alten Artefakte oder Job-IDs.

## Abnahmekriterien

- Nach „Neu generieren“ existiert kein alter Job mehr, der für die Szene gültig schreiben kann.
- Selbst ein nicht abbrechbarer externer Altjob ist durch Run-ID + Generation vollständig unschädlich.
- Sobald eine Szene terminal fehlschlägt, startet ab diesem Datenbank-Commit kein weiterer Audio-, Preclip-, Lip-Sync-, Retry-, Mux- oder Render-Schritt dieses Runs.
- Es gibt keinen direkten Render-Start mehr, der den atomaren Teardown umgehen kann.