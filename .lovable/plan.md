## Ergebnis der Analyse

Ja — wir können diesmal ziemlich klar erkennen, woran es liegt, aber nicht über einen offiziellen Provider-`error_code`.

Sync.so hat erneut **keinen maschinenlesbaren Errorcode** geliefert:

```text
status: FAILED
model: sync-3
error_code: null
error: "An unknown error occurred."
```

Der GET-Fallback gegen den Sync.so-Job hat ebenfalls nur diesen generischen Fehler zurückgegeben. Der eigentliche Hinweis steckt deshalb im von uns gespeicherten Payload.

## Wahrscheinliche Ursache

Unsere `segments[]` sind formal vorhanden und `model=sync-3` ist aktiv. Der Fehler sitzt sehr wahrscheinlich in `audioInput.startTime/endTime`.

Aktueller Payload der fehlgeschlagenen Szene:

```text
Segment 1:
scene 0.000–2.229
speaker_1 audioInput 0.000–2.229

Segment 2:
scene 2.479–3.454
speaker_2 audioInput 2.479–3.454

Segment 3:
scene 3.704–6.630
speaker_3 audioInput 3.704–6.630
```

Aber die Audio-Inputs sind **separate, enge Sprecher-WAVs**, nicht ein gemeinsamer Master-WAV:

```text
Samuel  ~2.276s
Matthew ~0.882s
Kailee  ~2.972s
```

Damit referenziert Segment 2 in Matthews WAV den Bereich `2.479–3.454s`, obwohl Matthews WAV nur ca. `0.882s` lang ist. Segment 3 referenziert in Kailees WAV `3.704–6.630s`, obwohl Kailees WAV nur ca. `2.972s` lang ist.

Die Sync.so-Doku sagt: `audioInput.startTime/endTime` ist ein optionaler Crop **innerhalb des jeweiligen Audio-Inputs**. Bei separaten Audioclips pro Segment/Speaker soll man nur den `refId` übergeben, oder relativ zum Audioclip croppen. Wir übergeben aktuell versehentlich die **Video-Timeline-Zeit** als **Audio-Crop-Zeit**.

## Fix-Plan

1. **Payload-Korrektur in `compose-dialog-segments`**
   - Im official `segments[]`-Pfad bei separaten Speaker-WAVs ändern von:

   ```ts
   audioInput: { refId, startTime: s, endTime: e }
   ```

   zu:

   ```ts
   audioInput: { refId }
   ```

   - Die Segment-Timeline bleibt weiter über `segment.startTime/endTime` gesteuert.
   - `sync_mode: "cut_off"` bleibt erhalten.

2. **Optionaler Sicherheits-Guard vor Dispatch**
   - Wenn wir doch jemals `audioInput.startTime/endTime` senden, validieren wir vor Sync.so:
     - Crop-Zeit muss innerhalb der referenzierten Audio-Datei liegen.
     - Sonst kein Provider-Dispatch, sondern klarer interner Fehler wie `segment_audio_crop_out_of_range`.
   - Das verhindert zukünftig wieder generische Provider-Fehler ohne Diagnose.

3. **Bessere Dispatch-Diagnostik**
   - Log ergänzen: `audio_input_mode=ref_only` oder `audio_input_mode=cropped`.
   - In `syncso_dispatch_log.meta` speichern:
     - Segment-Zeiten
     - Audio-Ref
     - ob Crop-Felder gesendet wurden
   - So sehen wir beim nächsten Fehlschlag sofort, ob es Payload, Face-Targeting oder Provider ist.

4. **Kein erneuter Modellwechsel**
   - `sync-3` bleibt für diesen 3-Sprecher-Official-Segments-Pfad aktiv.
   - `segments_secs` bleibt entfernt.
   - Kein Face-Crop-Preclip und keine UI-Änderung.

5. **Nach Implementierung testen**
   - Dieselbe Szene sauber neu starten.
   - Erwarteter neuer Payload:

   ```json
   {
     "segments": [
       { "startTime": 0, "endTime": 2.229, "audioInput": { "refId": "speaker_1" } },
       { "startTime": 2.479, "endTime": 3.454, "audioInput": { "refId": "speaker_2" } },
       { "startTime": 3.704, "endTime": 6.63, "audioInput": { "refId": "speaker_3" } }
     ]
   }
   ```

## Kurz gesagt

Der Provider liefert leider keinen Errorcode, aber der gespeicherte Request zeigt einen sehr konkreten Bug: Wir croppen separate Sprecher-Audios mit globalen Szenenzeiten. Das ist wahrscheinlich der Grund für `An unknown error occurred.`

<presentation-actions>
  <presentation-open-history>View History</presentation-open-history>
</presentation-actions>

<presentation-actions>
<presentation-link url="https://docs.lovable.dev/tips-tricks/troubleshooting">Troubleshooting docs</presentation-link>
</presentation-actions>