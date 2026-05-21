## Befund

Der neue Fehler ist jetzt eindeutig isoliert:

- Die aktuelle Szene `e3df41ad-aaa1-4659-85c2-0630e458dd52` hängt bei:
  - `lip_sync_status = running`
  - `twoshot_stage = lipsync_1`
  - `replicate_prediction_id = null`
  - `syncJobs = null`
- Die Diagnose-Historie enthält nur `pipeline_started`, aber **keinen** `sync_job_created`.
- Die Edge-Function-Logs zeigen direkt danach:

```text
[compose-twoshot-lipsync ...] lipsync engine = sync.so/v2 (direct)
ERROR CPU Time exceeded
```

Das bedeutet: Der Crash passiert **vor** dem Sync.so-Submit. Sync.so ist in diesem konkreten Fehler nicht die Ursache; die Edge Function wird durch CPU-Limit beendet, bevor überhaupt ein Provider-Job existiert.

## Wahrscheinliche Ursache im Code

Der Hotspot ist der MP4-Dimensions-Probe in `compose-twoshot-lipsync`:

```ts
const buf = new Uint8Array(await resp.arrayBuffer());
const textAt = (i, n) => String.fromCharCode(...buf.slice(i, i + n));
for (let i = 0; i < buf.length - 32; i++) {
  if (textAt(i, 4) !== "tkhd") continue;
}
```

Das lädt den kompletten MP4-Clip und scanned Byte-für-Byte mit `String.fromCharCode(...slice)`; bei größeren Hailuo/Sync-Clips ist das CPU-intensiv genug, um die Edge Function hart zu killen. Weil der Kill außerhalb normaler JS-Fehlerbehandlung passiert, greifen Refund und Fehlerstatus nicht zuverlässig.

## Plan zur Behebung

### 1. Vollständigen MP4-Download aus dem Startpfad entfernen

In `compose-twoshot-lipsync`:

- Für Pass 1 keine MP4-Dimensionen mehr durch Vollscan ermitteln.
- Primär die bereits gespeicherten `audio_plan.twoshot.faceMap.width/height` verwenden.
- Bei vorhandenem FaceMap sind die Pixel-Koordinaten bereits auf Anchor-Dimensionen normalisiert; das reicht für den ersten Sync.so-Submit.
- Dadurch wird der CPU-intensive Block vor `sync_job_created` entfernt.

### 2. Falls Video-Dimensionen wirklich nötig sind: bounded parser

Den vorhandenen `probeMp4Dims` in `compose-twoshot-lipsync` und `poll-twoshot-lipsync` ersetzen durch:

- HTTP `Range: bytes=0-1048575` statt kompletter Datei.
- Byte-Vergleich statt `String.fromCharCode(...slice)` in jeder Schleife.
- Harte maximale Scanlänge.
- Bei fehlgeschlagenem Probe: sofort auf FaceMap-/Anchor-Dimensionen fallbacken.

### 3. Status erst nach echtem Sync.so-Job auf `lipsync_1` setzen

Aktuell wird `twoshot_stage = lipsync_1` gesetzt, bevor ein Sync.so-Job existiert. Das erzeugt bei CPU-Kill wieder Zombie-State.

Umbau:

- Vorbereitungsphase: `twoshot_stage = preflight`, `lip_sync_status = running`, Diagnose `preflight_started`.
- Erst nach erfolgreichem `startSyncSoDirectGeneration(...)`:
  - `twoshot_stage = lipsync_1`
  - `replicate_prediction_id = sync:<jobId>`
  - `syncJobs.jobs[0]` schreiben
  - Diagnose `sync_job_created`

### 4. Credits erst direkt vor Provider-Submit abbuchen

Damit ein CPU-Abbruch in der Preflight-Phase keine Credits verbrennt:

- Wallet nur prüfen, aber noch nicht abbuchen.
- FaceMap, Speaker-Tracks und Zielkoordinaten vorbereiten.
- Direkt vor `startSyncSoDirectGeneration` nochmal Wallet prüfen und dann abbuchen.
- Wenn der Provider-Submit fehlschlägt, bestehende Refund-Logik nutzen.

### 5. Watchdog für Preflight-Abbruch erweitern

`twoshot-lipsync-watchdog` soll erkennen:

```text
lip_sync_status = running
stage = preflight oder lipsync_1
kein sync:* job
keine syncJobs.jobs[]
updated_at älter als z.B. 2 Minuten
```

Dann:

- wenn keine Abbuchung nachweisbar: zurück auf `pending`, `twoshot_stage = null`
- wenn Abbuchung nachweisbar: refund + zurück auf `pending`
- Diagnose `preflight_cpu_abort_recovered` anhängen
- `compose-twoshot-lipsync` neu auslösen

### 6. Aktuelle Szene reparieren

Nach dem Code-Fix:

- Szene `e3df41ad-aaa1-4659-85c2-0630e458dd52` aus dem Zombie-State holen.
- `lip_sync_status = pending`, `twoshot_stage = null`, `replicate_prediction_id = null` setzen.
- `clip_error = auto-retry: cpu-time-preflight-fix applied` speichern.
- Falls die bisherigen zwei CPU-Abbrüche Credits abgezogen haben, den Betrag anhand der Szene-Diagnose/Wallet-Historie prüfen und idempotent erstatten.

## Erwartetes Ergebnis

- Kein `CPU Time exceeded` mehr vor Sync.so.
- UI hängt nicht mehr bei `lipsync_1` ohne Job-ID.
- Jede echte Provider-Ausführung hat sofort eine `sync:<jobId>` und Diagnose-Eintrag.
- Preflight-Crashes sind automatisch recoverable und verbrennen keine Credits.

<presentation-actions>
  <presentation-open-history>View History</presentation-open-history>
</presentation-actions>

<presentation-actions>
<presentation-link url="https://docs.lovable.dev/tips-tricks/troubleshooting">Troubleshooting docs</presentation-link>
</presentation-actions>