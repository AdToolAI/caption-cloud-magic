## Was gerade schiefgelaufen ist

Der aktuelle Lauf hängt **nicht mehr am alten Sync.so-400/Coordinates-Fehler**. Die 4 Provider-Pässe wurden sogar abgeschlossen:

- Pass 1: `done`
- Pass 3: `done`
- Pass 4: `done`
- Pass 2: wurde durch den Watchdog vorher auf `pending` zurückgesetzt, obwohl der alte Provider-Job später noch als Webhook kam

Dadurch ist die Szene in einem inkonsistenten Zustand:

- `lip_sync_status = pending`
- `twoshot_stage = syncso_fanout_3_of_4`
- `dialog_shots.status = rendering`
- kein Eintrag mehr in `syncso_inflight_jobs`
- `lipsync-watchdog` scannt `0`, weil sein Filter genau diesen Zustand nicht überwacht

Kurz: **Der Provider ist nicht mehr das Hauptproblem. Die Pipeline-State-Machine hat sich selbst in einen Zombie-Zustand gebracht.**

## Ziel der Reparatur

Die Pipeline soll nicht weiter mit neuen Provider-/ASD-Patches behandelt werden, sondern als robuste Zustandsmaschine aufgeräumt werden:

1. abgeschlossene Provider-Jobs dürfen nicht durch Watchdog-Retries überschrieben werden
2. alte/späte Webhooks dürfen nicht als Orphan ignoriert werden, wenn sie zu einem Retry-Pass gehören
3. der Watchdog muss `pending + syncso_fanout_*` Szenen scannen
4. wenn alle verwertbaren Outputs vorhanden sind, muss die Szene automatisch in `audio_muxing`/`complete` weiterlaufen
5. bestehende hängende Szene wird gezielt repariert, ohne Credits doppelt zu belasten

## Implementierungsplan

### 1. Aktuelle hängende Szene reparieren

Für Scene `34be230a-2860-4992-ae3d-25e70dfefac9`:

- Pass 2 hat einen alten erfolgreichen Job/Webhook (`8511fa60-55cc-4d6d-8b2c-c23bc29a77e1`), wurde aber aus `passes[]` entfernt bzw. auf `pending` gesetzt.
- Ich werde die DB nicht blind finalisieren, sondern zuerst im Dispatch/Webhook-Log prüfen, ob für diesen Job ein `output_url`/rehosted output existiert.
- Wenn vorhanden: Pass 2 wieder als `done` setzen und anschließend die normale Audio-Mux-Pipeline anstoßen.
- Wenn nicht vorhanden: nur diesen Pass sauber neu dispatchen, nicht die ganze Szene neu starten.

### 2. `lipsync-watchdog` Scanfilter korrigieren

Aktuell scannt der Watchdog diesen Zustand nicht:

```text
lip_sync_status = pending
twoshot_stage = syncso_fanout_3_of_4
```

Ich erweitere den Filter auf:

```text
pending + twoshot_stage like syncso_fanout_%
pending + twoshot_stage like syncso_retry_%
pending + dialog_shots.version=5 + dialog_shots.engine=sync-segments
```

Damit solche Zombie-Fanout-Szenen wieder vom Watchdog gesehen werden.

### 3. Watchdog darf fertige Passes nicht zurück auf `pending` zerstören

Der aktuelle Auto-Retry setzt `rendering`-Passes auf `pending`, wenn ein Timeout angenommen wird. In dieser Szene kam danach aber noch ein erfolgreicher Webhook.

Ich ändere die Retry-Regel:

- vor dem Zurücksetzen eines Passes wird der Provider-Job nochmal aktiv gepollt
- wenn Provider bereits `COMPLETED` ist: Webhook-Forward statt Retry
- wenn der Pass schon ein `output_url` oder ein terminaler Dispatch-Log-Eintrag hat: nicht zurücksetzen
- `done`-Passes bleiben unantastbar

### 4. Webhook-Orphan-Handling verbessern

Aktuell sagt der Webhook:

```text
ORPHAN (not in passes[] count=4) — releasing inflight slot
```

Das ist für späte Webhooks nach Watchdog-Retry gefährlich.

Ich ändere das Verhalten:

- Wenn ein Webhook-Job nicht mehr in `passes[].job_id` steht, wird zusätzlich in `syncso_dispatch_log` nach `scene_id + job_id` gesucht.
- Wird dort der ursprüngliche `pass_idx` gefunden, wird der Webhook diesem Pass wieder zugeordnet.
- Nur wenn auch die Dispatch-Historie keinen Match findet, bleibt es ein echter Orphan.

### 5. Finalisierungs-Gate robust machen

Aktuell braucht der Webhook offenbar `doneCount === totalPasses`. Wenn ein alter Retry einen Pass auf `pending` gesetzt hat, obwohl ein Output existiert, wird nie muxed.

Ich baue eine kleine Normalisierung vor dem Finalisierungs-Gate:

- Pass gilt als verwertbar, wenn `status=done` und `output_url` existiert
- oder wenn `syncso_dispatch_log` + Webhook/Provider-Poll den Job als completed rekonstruieren kann
- `pending` ohne Job, aber mit bekannt abgeschlossenem vorherigen Job, wird repariert
- danach wird Audio-Mux ausgelöst

### 6. Validierung

Nach Umsetzung:

- betroffene Szene prüfen: Status muss aus `pending/syncso_fanout_3_of_4` raus
- `lipsync-watchdog` muss wieder `scanned > 0` zeigen, solange eine Szene hängt
- 4-Sprecher-Lauf erneut starten
- erwarteter Ablauf:

```text
4× Sync.so 201
4× webhook completed oder watchdog poll completed
0× ORPHAN für bekannte job_id
ALL 4 passes done → audio_muxing
final clip_url ready
lip_sync_status applied
```

## Dateien, die ich ändern würde

- `supabase/functions/lipsync-watchdog/index.ts`
- `supabase/functions/sync-so-webhook/index.ts`
- ggf. `supabase/functions/compose-dialog-segments/index.ts` nur minimal, falls der Dispatch-State `current_pass/twoshot_stage` konsistenter geschrieben werden muss
- `.lovable/plan.md` und Memory-Doku für die neue Invariant-Regel

## Wichtig

Ich würde jetzt **keinen weiteren Sync.so-Payload/ASD-Patch** machen. Der heutige Lauf zeigt: Payload v140 geht raus und Provider-Jobs kommen durch. Der Fehler liegt jetzt in unserer Retry-/Webhook-/Watchdog-Zustandslogik.