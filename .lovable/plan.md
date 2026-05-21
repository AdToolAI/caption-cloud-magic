## Befund

Der neue Fehler ist nicht mehr der alte Sync.so-400-Fehler und auch nicht das frühere Sprecherfenster-Problem. Der konkrete Lauf ist an einer eigenen Code-Stelle abgebrochen:

```text
pipeline_exception: pass1Segment[0].toFixed is not a function
Scene: 1b461aaa-7130-473b-b230-bec01655fa65
```

Ursache: Nach der Korrektur auf mehrere Turn-Fenster kann `pass1Segment` jetzt entweder so aussehen:

```text
[2.618, 3.547]
```

oder so:

```text
[[0.000, 2.368], [3.797, 6.630]]
```

Die Diagnose-Zeile behandelt aber beide Fälle noch wie ein einzelnes Fenster und ruft `pass1Segment[0].toFixed(...)` auf. Bei mehreren Fenstern ist `pass1Segment[0]` ein Array, keine Zahl. Dadurch wurde der Sync.so Job zwar bereits erstellt, aber direkt danach wirft unser Code eine Exception, refundet und markiert die Szene als fehlgeschlagen.

Zusätzlich habe ich noch zwei Folgeprobleme gefunden, die wir mitbeheben sollten:

1. **Retry verliert Segment-Fenster**
   - `poll-twoshot-lipsync` resubmittet bei Provider-Fehlern aktuell ohne `audioSegmentSecs`/`segmentSecs`.
   - Das könnte wieder dazu führen, dass ein Retry ohne Fenster läuft und fremde Zeilen auf ein Gesicht mappt.

2. **Fallback-Text ist veraltet**
   - Der Kommentar sagt „isolated speaker track“, tatsächlich verwenden wir inzwischen bewusst die merged WAV plus `segments_secs`.
   - Der Fallback muss daher ebenfalls dieselben Segmentfenster behalten oder ganz bewusst nicht in einen gefährlichen Vollspur-Modus wechseln.

## Plan

1. **Segment-Format zentral normalisieren**
   - In `compose-twoshot-lipsync` und `poll-twoshot-lipsync` eine kleine Helper-Logik nutzen, die jedes Segmentformat sauber in `Array<[start,end]>` umwandelt.
   - Einzelnes Fenster und Multi-Fenster werden dadurch einheitlich behandelt.

2. **Diagnose-Logging crash-sicher machen**
   - Die fehlerhaften Stellen ersetzen:

```text
pass1Segment[0].toFixed(...)
nextSegment[0].toFixed(...)
```

   - Stattdessen wird eine sichere Formatierung genutzt, z. B.:

```text
windows=[2.62-3.55]
windows=[0.00-2.37, 3.80-6.63]
```

3. **Retries behalten exakt dieselben Segment-Fenster**
   - Bei transienten Sync.so-Fehlern wird `latestCurrentJob.audioSegmentSecs` wieder an `startSyncJob(... segmentSecs: ...)` übergeben.
   - Dadurch bleibt jeder Retry auf denselben Sprecher-Turn begrenzt.

4. **Fallback absichern**
   - Auch der Auto-Detect-Fallback bekommt dieselben `audioSegmentSecs`, statt mit kompletter merged WAV ohne Fenster zu laufen.
   - Die Metadaten werden korrekt speichern: `audioUrl` = tatsächlich verwendete merged WAV, `audioSegmentSecs` = exakte Fenster.

5. **Zweite-Pass-Metadaten korrigieren**
   - Beim Start von Pass 2 wird `audioSegmentSecs: nextSegment` gespeichert.
   - `audioUrl` wird auf die tatsächlich verwendete merged WAV gesetzt, nicht auf den alten per-character Track.

6. **Betroffene Szene zurücksetzen**
   - Szene `1b461aaa-7130-473b-b230-bec01655fa65` wird von `failed` zurück auf `pending` gesetzt.
   - `twoshot_stage`, `clip_error`, `replicate_prediction_id` und stale `syncJobs` werden entfernt.
   - Der Quellclip bleibt erhalten, damit der nächste Lauf direkt mit dem korrigierten Code neu starten kann.

7. **Deploy und kurze Validierung**
   - `compose-twoshot-lipsync` und `poll-twoshot-lipsync` deployen.
   - Danach prüfen, dass der fehlerhafte `.toFixed`-Pfad nicht mehr auftreten kann und die Szene wieder sauber neu gestartet werden kann.