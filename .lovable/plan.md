**Befund**

- Der aktuelle Fehl-Run ist kein alter/staler Payload mehr: `engine = sync-official-segments-v55`, `model = sync-3`, `audio_input_mode = ref_only`.
- Sync.so nimmt den Job an (`201 Created`) und scheitert erst intern mit `FAILED`, `error_code = null`, `error = "An unknown error occurred."`. Auch der nachgelagerte GET-Fallback liefert keinen besseren Code.
- Laut Sync.so-Doku ist `audioInput.startTime/endTime` ein Crop innerhalb des referenzierten Audios. Genau das können wir jetzt korrekt nutzen, weil es bereits ein Master-Dialog-WAV mit der kompletten Timeline gibt.
- Wahrscheinlichster verbleibender Fehler: Wir senden mehrere kurze Speaker-WAVs als Inputs und referenzieren sie pro Segment nur noch per `{ refId }`. Das ist formal erlaubt, aber bei kurzen Segmenten wie 0.929s plus mehreren Audio-Inputs scheint Sync-3 intern zu scheitern. Der dokumentkonformere Weg ist: ein Master-Audio als Input, und jedes Segment croppt daraus seinen Timeline-Bereich.
- Zweiter möglicher Auslöser: Die aktuelle per-segment Speaker-Auswahl enthält `auto_detect: false` plus `frame_number + coordinates`. Die Doku-Beispiele für Segmente zeigen nur `frame_number + coordinates`; `auto_detect` ist default false und sollte nicht zusätzlich als eigener ASD-Modus mitgeschickt werden.
- Dritter Risikofaktor: `plate_detected=false`. Die Koordinaten kommen aus der Anchor-Face-Map, nicht aus einem echten extrahierten Video-Frame. Sync.so verlangt Koordinaten im Frame-Koordinatensystem; wenn Hailuo die Plate anders croppt, landen die Punkte daneben.

**Plan**

1. **v56 Master-Audio-Payload bauen**
   - Für 3+ Sprecher nur noch ein Audio-Input an Sync.so senden: das vorhandene Master-Dialog-WAV.
   - Jedes Segment bekommt dann:
     - `startTime/endTime` für das Video-Segment
     - `audioInput: { refId: "dialog_master", startTime, endTime }`
   - Damit sind die Audio-Crops endlich relativ zum richtigen Audiofile, nämlich zur vollständigen Dialog-Timeline.

2. **Sync-3 Speaker-Selection strikt an Doku anpassen**
   - In `optionsOverride.active_speaker_detection` nur noch `frame_number` und `coordinates` senden.
   - `auto_detect: false` entfernen, weil der Default bereits false ist und die Segment-Beispiele es nicht mitsenden.

3. **Retry-Fallback ohne manuelle Speaker-Koordinaten**
   - Wenn Sync.so weiterhin `error_code = null` / unknown liefert, einmal mit demselben Master-Audio-Payload retryen, aber ohne `optionsOverride.active_speaker_detection`.
   - Ziel: Wenn die Koordinaten/Frame-Auswahl der Auslöser sind, bekommen wir zumindest einen fertigen Clip statt eines harten Abbruchs.

4. **Diagnostik verbessern**
   - In den Dispatch-Logs speichern:
     - Payload-Modus `master_audio_crop`
     - Segmentzeiten
     - verwendeter ASD-Modus `manual_point_minimal` oder `auto_asd_fallback`
     - ob Koordinaten aus echter Plate-Erkennung oder nur aus Anchor-Fallback kommen
   - Fehlklassifizierung erweitern: unknown + v56 manual ASD wird als `sync3_manual_asd_or_plate_coords_failed` markiert; unknown + auto ASD als echter Provider-/Medienfehler.

5. **Szene sauber resetten**
   - Nach Deploy die betroffene Szene auf pending setzen und alte v55 Jobdaten entfernen.
   - Neuer Lauf muss dann `engine = sync-official-segments-v56`, `audio_input_mode = master_audio_crop` zeigen.

**Erwartetes Ergebnis**

- Wenn der Fehler an den kurzen per-speaker WAVs lag, sollte v56 direkt durchlaufen.
- Wenn der Fehler an den manuellen Face-Koordinaten lag, sollte der Auto-ASD-Retry durchlaufen.
- Wenn Sync.so danach weiterhin ohne Code scheitert, ist es sehr wahrscheinlich die konkrete Video-Plate selbst: Gesichter zu klein/zu stark gecroppt/zu nah am oberen Rand oder Sync-3 kann diese Hailuo-Komposition nicht verarbeiten.