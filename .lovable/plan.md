## Kurzantwort

Ja, wir können die Ursache eingrenzen und beheben. Es sind zwei verschiedene Probleme, die sich überlagern:

1. **Der aktuelle 95%-Hänger ist ein App-State-Bug, kein laufender Anbieter-Job.**
2. **Die eigentlichen Lip-Sync-Crashes kommen von der aktuellen Two-Pass-Strategie gegen Sync.so, die bei Multi-Face-Clips weiterhin fragil ist.**

## Was ich konkret gefunden habe

### Aktuelle hängende Szene

Die aktuelle Szene `97a82039-19e1-4b6c-a050-98ed4e9db81c` steht so in der Datenbank:

```text
lip_sync_status = pending
twoshot_stage = lipsync_1
replicate_prediction_id = 8mjrptg1phrmy0cy8z5tpvwfv4
syncJobs = leer
heartbeat = leer
clip_error = auto-reset: stale running
```

Das ist ein Zombie-State:

- `lipsync_1` sagt der UI: „Lip Sync läuft“.
- `pending` sagt dem Backend: „wartet auf Neustart“.
- Es gibt aber **keine Sync.so Job-ID** (`sync:*`) und keinen `syncJobs.jobs[]` Eintrag.
- Der Watchdog ignoriert diesen Zustand aktuell, weil er pending-Szenen mit `twoshot_stage = lipsync_1` nicht neu startet.
- Der Client ignoriert ihn ebenfalls, weil er `lipsync_1` nicht als startbaren Retry-Zustand akzeptiert.

Darum hängt die Anzeige bei 95%, obwohl kein echter Job mehr läuft.

### Warum der eigentliche Lip Sync crasht

Bei der vorherigen Szene `cb2b149d-a926-48c5-8589-e3c590faface` ist der Anbieter wirklich gescheitert:

```text
clip_error = source_clip_unusable: Sync.so refused both face-targeted and auto-detect passes
syncJobs.jobs = 2
fallbackMode = auto_detect_single_pass
lastError = An unknown error occurred.
```

Das heißt: Dort wurde Sync.so tatsächlich erreicht, aber Sync.so hat sowohl den face-targeted Pass als auch den Auto-Detect-Fallback abgelehnt.

Das Muster wiederholt sich in älteren Szenen mit:

```text
syncso_failed: An error occurred in the generation pipeline.
```

Die wahrscheinliche technische Ursache ist nicht „11 Minuten warten“, sondern die Art, wie wir Zwei-Charakter-Lip-Sync aktuell ausführen:

- Wir starten sequentielle Einzel-Passes pro Sprecher.
- Dafür wird ein Gesicht per BBox/Koordinate auf Frame 0 gepinnt.
- Der Clip bleibt aber ein echter Zwei-Personen-Clip mit mehreren sichtbaren Gesichtern.
- Sync.so dokumentiert für Multi-Speaker-Fälle eigentlich die **Segments API**: mehrere Audio-Inputs + Zeitsegmente in einem einzigen Generate-Call.
- Unsere aktuelle Two-Pass-Strategie erzeugt mehr Angriffsfläche: falsches Gesicht, Provider-internes Face-Tracking, Zwischendatei, zweiter Pass, Timeout, Reset-State.

Zusätzlich gibt es einen Architekturfehler im Statushandling:

- `compose-twoshot-lipsync` setzt früh `twoshot_stage = lipsync_1` und `lip_sync_status = running`.
- Erst später wird der echte Sync.so Job erstellt und als `replicate_prediction_id = sync:<jobId>` gespeichert.
- Wenn die Hintergrundausführung zwischen diesen Schritten stirbt oder vom Client zurückgesetzt wird, bleibt `lipsync_1` ohne echten Job zurück.

## Können wir das beheben?

Ja. Nicht indem wir nur mehr Retries hinzufügen, sondern indem wir die Pipeline robuster umbauen.

## Fix-Plan

### 1. Zombie-State sofort reparieren

In `useTwoShotAutoTrigger` und `twoshot-lipsync-watchdog` wird dieser Zustand erkannt:

```text
pending + lipsync_* + keine sync:* Job-ID + keine syncJobs.jobs[] + kein heartbeat
```

Dann wird die Szene sauber zurückgesetzt:

```text
twoshot_stage = null
replicate_prediction_id = null
clip_error = auto-retry: zombie_lipsync_stage_without_sync_job
```

Danach wird `compose-twoshot-lipsync` neu aufgerufen.

### 2. Fortschrittsbalken korrigieren

`usePipelineProgress` darf `twoshot_stage = lipsync_1` nur noch als laufend zählen, wenn wirklich ein Job existiert:

```text
lip_sync_status = running
oder replicate_prediction_id beginnt mit sync:
oder audio_plan.twoshot.syncJobs.jobs[] enthält Job
oder heartbeat.syncJobId existiert
```

Damit kann die UI nicht mehr bei 95% hängen, wenn backendseitig nichts läuft.

### 3. Diagnose-Historie an jede Szene schreiben

Wir speichern in `audio_plan.twoshot.diagnostics` die letzten Statuswechsel:

```text
source, event, stage, status, jobId, reason, timestamp
```

Dann sehen wir beim nächsten Fehler sofort:

- ob Sync.so überhaupt erstellt wurde,
- welcher Job gepollt wurde,
- ob der Client zurückgesetzt hat,
- ob der Watchdog eingegriffen hat,
- ob ein Provider-Fehler oder ein App-State-Fehler vorliegt.

### 4. Two-Pass als Hauptstrategie ersetzen

Für echte Zwei-Charakter-Szenen sollten wir die Sync.so **Segments API** als primäre Strategie verwenden:

```text
1 Video Input
2 Audio Inputs, je Sprecher
Segments mit startTime/endTime + audioInput.refId
1 Sync.so Generate-Job
```

Das passt besser zum Problem als zwei nacheinander gerenderte Face-Passes.

Vorteil:

- nur ein Provider-Job,
- keine Zwischenclip-Kaskade,
- weniger Timeout-Risiko,
- bessere Multi-Speaker-Semantik,
- weniger Zombie-State-Möglichkeiten.

### 5. Two-Pass nur noch als Fallback behalten

Wenn Segments von Sync.so abgelehnt wird, kann Two-Pass weiterhin als Fallback existieren. Aber nicht mehr als Standardpfad.

### 6. Aktuelle Szene nach dem Fix zurücksetzen

Die aktuelle Szene wird nach der Codeänderung sauber neu startbar gemacht:

```text
lip_sync_status = pending
twoshot_stage = null
replicate_prediction_id = null
clip_error = auto-retry: segmented pipeline fix applied
```

## Ergebnis

Nach dem Umbau unterscheiden wir sauber:

- **Provider crasht wirklich** → klare Diagnose + Refund + Fallback.
- **App-State hängt** → Watchdog/Client reparieren automatisch.
- **Kein echter Job läuft** → UI zeigt keinen 95%-Dauerlauf mehr.
- **Zwei Sprecher** → primär ein Segment-basierter Multi-Speaker-Job statt fragiler Zwei-Pass-Kaskade.

<presentation-actions>
  <presentation-open-history>View History</presentation-open-history>
</presentation-actions>

<presentation-actions>
<presentation-link url="https://docs.lovable.dev/tips-tricks/troubleshooting">Troubleshooting docs</presentation-link>
</presentation-actions>