## Ziel

Nicht weiter an Face-Detection-Symptomen drehen. Wir isolieren die echte Ursache des `generation_unknown_error`, indem wir dieselben fehlgeschlagenen Assets kontrolliert mit Varianten erneut testen und die Unterschiede beweisbar loggen.

Wichtig: Ich kenne kein externes/geheimes Referenzprojekt außerhalb dieses Projekts. Was wir aber haben, ist diese konkrete Pipeline, echte Dispatch-Logs und die fehlgeschlagenen Szenen. Daraus bauen wir jetzt eine belastbare Forensik.

## Beobachtung aus den aktuellen Daten

Bei den zwei aktuellen Szenen ist der harte Fehler nicht `no_face`, sondern Sync.so selbst:

- `33427056-3a18-4685-b975-7f611f069751`
- `ec23f623-bca0-42f0-a7d3-5e0d84cdd407`

Beide wurden mit ungefähr diesem Muster geschickt:

```text
model: sync-3
sync_mode: cut_off
video: dialog-pass-preclip-...mp4
audio: ...pass-1-tight-...wav
active_speaker_detection:
  auto_detect: false
  coordinates: [360, 360]
  frame_number: 3 oder 52
provider result: FAILED / Something went wrong while processing this generation
```

Auffällig:

- Es ist der erste Sprecher/erste Pass, nicht vier fertige Speaker-Pässe.
- Die echte Provider-Antwort ist generisch, deshalb müssen wir über A/B-Replays herausfinden, ob Audio, Preclip, Frame-Anchor, ASD-Koordinaten, Codec oder `sync-3 + coords` der Auslöser ist.
- Die bisherigen Logs speichern noch zu wenig technische Messwerte (`audio_dur_sec`, `audio_peak_dbfs` etc. sind bei diesen Zeilen leer), also fehlt genau die Evidenz, die wir brauchen.

## Plan

### 1. Failed-Scene Snapshot vervollständigen

Für fehlgeschlagene Dialog-Szenen wird ein vollständiger technischer Snapshot gespeichert:

- Provider-Payload exakt wie gesendet
- Video-URL, Audio-URL
- Video-Dauer, Auflösung, FPS, Codec, Framecount
- Audio-Dauer, Sample-Rate, Kanäle, Peak/RMS, Voice-Window-Länge
- Audio-vs-Video-Differenz
- Preclip-Crop-Daten und Preclip-Dimensionen
- ASD-Frame und ASD-Koordinaten
- ob Koordinaten in Plate- oder Preclip-Space liegen
- Face-Probe-Status getrennt nach `plate` und `preclip`

Damit hört das Rätselraten auf: Jede Failure-Zeile muss erklären, was Sync.so wirklich bekommen hat.

### 2. Sync.so Replay-Lab für kontrollierte A/B-Tests bauen

Ein admin/debug-only Replay-Pfad testet dieselben Assets der fehlgeschlagenen Szene mit einer kleinen Varianten-Matrix. Kein breites Retry-Chaos, sondern exakt isolierte Experimente.

Varianten:

```text
A  original payload
   preclip + tight audio + sync-3 + coords + original frame

B  frame anchor changed
   same video/audio, but frame_number = safe mid-frame with visible face

C  audio trimmed/normalized
   same video/frame, but audio trimmed to voiced window and normalized

D  audio duration matched to video
   same video/frame, but audio length <= preclip duration or explicit cut_off-safe window

E  ASD mode changed
   same video/audio, but auto_detect:true on clean single-face preclip

F  source changed
   master plate instead of preclip, same speaker coordinate transformed correctly

G  codec normalization
   re-encoded preclip/audio with conservative settings, same semantic content
```

Each run logs:

- submitted payload hash
- provider job id
- provider status/error
- output duration/url when successful
- changed variable compared to original
- pass/fail classification

### 3. Root-cause classifier statt generischem `other`

Wenn ein Replay-Ergebnis zurückkommt, wird es automatisch eingeordnet:

```text
original fails + mid-frame passes
=> root cause: bad/unsafe frame anchor

original fails + audio-trim passes
=> root cause: audio/video duration or silence/voiced-window mismatch

original fails + auto_detect passes
=> root cause: sync-3 coords/ASD incompatibility on preclip

original fails + normalized codec passes
=> root cause: preclip/audio container or codec issue

all variants fail
=> root cause likely provider-side incompatibility with generated plate/preclip; production fallback must avoid this provider path for that asset class
```

### 4. Nur den bewiesenen Produktionsfix einbauen

Erst nach den Replay-Ergebnissen wird der eigentliche Fix gesetzt:

- Bei Frame-Ursache: nie Frame `3`/Randframes verwenden; nur validierte Mid-Frames mit sichtbarem Gesicht.
- Bei Audio-Ursache: tight audio auf voiced window trimmen/normalisieren und Länge an Preclip/`cut_off` anpassen.
- Bei ASD-Ursache: für saubere Single-Face-Preclips `auto_detect:true` oder dokumentiert stabile Variante statt `coords-pro` verwenden.
- Bei Codec-Ursache: Preclip/audio vor Sync.so immer konservativ re-encoden.
- Bei Provider-Inkompatibilität: deterministischer Fallback-Pfad statt blindem Retry derselben Variante.

### 5. Forensik-False-Positives separat entschärfen

Parallel, aber nicht als Hauptfix:

- `no_face` darf nicht mehr als harte Ursache angezeigt werden, wenn `preclip_face_count=1` bereits validiert wurde.
- Anzeige unterscheidet klar:
  - `provider_failed`
  - `face_probe_unavailable`
  - `probe_inconclusive`
  - `real_no_face`
- Die Forensics-Sheet zeigt, ob die Prüfung auf Plate oder Preclip lief.

### 6. Stop-Loss gegen Kosten und Endlosschleifen

Der Replay-Pfad bekommt harte Grenzen:

- nur admin/debug
- nur für eine konkrete failed scene
- kleine maximale Variantenzahl
- jeder Provider-Call wird mit Variante und Kostenabsicht geloggt
- keine automatische breite Fanout-Wiederholung
- Refund bleibt idempotent für echte Produktionsfehler

## Ergebnis nach Umsetzung

Nach der Umsetzung können wir für eine fehlgeschlagene Szene sagen:

```text
Die Ursache war nicht allgemein “Face Detection”, sondern exakt:
- Frame-Anchor, oder
- Audio/Video-Längenmismatch, oder
- Sync-3 ASD-Mode, oder
- Codec/Container, oder
- Provider-Inkompatibilität mit dieser Preclip-Klasse.
```

Dann wird nur dieser bewiesene Pfad produktiv geändert, statt weiter blind an der Pipeline zu drehen.