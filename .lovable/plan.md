## Analyse

**Ja, ich weiß jetzt, was der aktuelle Fehler ist.**

Der neueste Abbruch ist nicht durch „sensitive content“ entstanden. In den letzten 24h gibt es in `syncso_dispatch_log` **0 sensitive-content Treffer**, aber **18 `generation_unknown_error` Treffer**.

### Was konkret passiert ist

Bei der gezeigten Szene `2363b3f1-d2c4-485b-90ff-aae78a3a3aad` lief die Pipeline so:

1. Die Szene hat 4 Sprecher und nutzt korrekt die Single-Face-Preclip-Pipeline.
2. Für Pass 2/3 wurde ein Preclip erstellt:
   - `dispatch_video_kind: preclip`
   - Crop sauber/isoliert: `preclip_ambiguity.risk = clean`
   - Kein Nachbar im Crop
3. Die Face-Validation des Preclips hat aber `preclip_face_count = null` gespeichert.
   - Das bedeutet nicht „kein Gesicht“.
   - Es bedeutet: Der Validator konnte den Face-Count nicht sicher liefern / hat permissiv weitergemacht.
4. Weil `preclip_face_count` nicht exakt `1` war, hat die neue v129.24-Logik **nicht** den erfolgreichen `auto_detect:true` Pfad genommen.
5. Stattdessen wurde wieder das alte schädliche Payload gesendet:

```text
model: sync-3
active_speaker_detection: {
  auto_detect: false,
  frame_number: 153,
  coordinates: [362, 360]
}
```

6. Genau dieser Payload-Typ war in unserem manuellen Test bereits als Ursache identifiziert: **Sync.so bricht auf engen Single-Face-Preclips mit expliziten Koordinaten häufig intern mit `generation_unknown_error` ab.**

### Warum es lange läuft und dann abbricht

Der Fehler entsteht nicht sofort in unserer Edge Function. Sync.so nimmt den Job zuerst mit `HTTP 201` an, verarbeitet dann serverseitig länger und schickt später per Webhook:

```text
generation_unknown_error
Something went wrong while processing this generation. Please try again.
```

Darum sieht es aus wie „läuft lange, dann bricht es ab“.

### Warum der Screenshot `face_at_frame` zeigt

Der Forensics-Screenshot zeigt zusätzlich einen Preflight-Blocker:

```text
Blocker erkannt: face_at_frame
Face exists but not at the active_speaker_detection coordinate
```

Das passt zum gleichen Muster: Die Pipeline hängt noch an Koordinatenprüfungen für einen Preclip, obwohl der sichere Weg bei einem sauberen Single-Face-Preclip laut Sync.so-Doku und unserem Repro-Test `auto_detect:true` ist.

Sync.so selbst sagt in der aktuellen Speaker-Selection-Doku:

- `auto_detect:true` ist für Single-/obvious-speaker Video-Clips gedacht.
- Manuelle `coordinates` sind für Mehrpersonen-Clips gedacht, wenn deterministische Auswahl nötig ist.

Unsere Preclips sind aber bereits auf **eine Person** zugeschnitten. Die Koordinate ist dort redundant und in der Praxis schädlich.

## Fix-Plan

### 1. Dispatch-Regel korrigieren

In `compose-dialog-segments` ändere ich die Entscheidung so:

```text
Wenn usePassPreclip=true
UND der Crop laut Ambiguity-Check sauber ist
UND kein Nachbar-Gesicht im Crop liegt
UND preclip_face_count nicht explizit > 1 ist:
  immer active_speaker_detection = { auto_detect: true }
```

Das bedeutet:

- `preclip_face_count = 1` → auto-detect
- `preclip_face_count = null` + clean crop → auto-detect
- `preclip_face_count = 0` → nicht an Sync.so schicken; sauber vorher failen/refunden oder Preclip reparieren
- `preclip_face_count > 1` oder Nachbar im Crop → nicht auto-detect; blocken oder deterministisch behandeln

### 2. Live Face-Gate an Auto-Detect anpassen

Wenn das finale Payload `auto_detect:true` nutzt, darf die Live Face-Gate nicht mehr „Gesicht an Koordinate“ prüfen, weil es dann keine Koordinate gibt.

Stattdessen:

- Bei `auto_detect:true`: nur prüfen, ob mindestens ein Gesicht im Preclip sichtbar ist, falls ein Frame verfügbar ist.
- Wenn keine Probe verfügbar ist, darf der saubere Preclip weiterlaufen.
- Kein `face_at_frame` Blocker für Single-Face-AutoDetect-Preclips.

### 3. Preclip-Face-Count robuster speichern

Bei Preclip-Validierung:

- Wenn der Validator keinen sicheren Count liefert, aber der Crop sauber ist und die Preclip-Renderdaten stimmen, wird der Count als `unknown_trusted` geloggt statt als `null`, damit spätere Logik nicht wieder in den Koordinatenpfad fällt.
- Die Forensics-Anzeige soll klar unterscheiden:
  - „kein Gesicht erkannt“
  - „Probe nicht verfügbar“
  - „sauberer Single-Face-Preclip, AutoDetect genutzt“

### 4. Audio/Video-Längen-Falle entschärfen

In den Logs ist zusätzlich auffällig:

```text
audio_full_sec: 9
video_dur_sec: 3.132
audio_vs_video_delta_sec: 5.868
```

Das kann zu langen Jobs, `cut_off`-Verhalten und instabiler Provider-Verarbeitung führen. Ich prüfe und korrigiere im selben Fix nur die Übergabe, damit Sync.so wirklich die passende Tight-Audio-Datei bzw. passende Dauer bekommt und nicht wieder eine 9s-Datei gegen einen 3.1s-Preclip läuft.

### 5. Bestehende kaputte Szene zurücksetzbar machen

Nach dem Codefix setze ich die betroffene fehlgeschlagene Szene optional auf einen retry-fähigen Zustand zurück, damit du nicht alles neu bauen musst.

Dabei werden keine Credits doppelt belastet; bestehende Refund-/Idempotenzlogik bleibt erhalten.

### 6. Validierung nach dem Fix

Ich prüfe danach per Datenbank/Logs:

- neues Dispatch-Payload enthält bei Preclip:

```text
active_speaker_detection: { auto_detect: true }
```

- kein `coordinates`/`frame_number` im Sync.so-Payload für saubere Single-Face-Preclips
- kein `face_at_frame` Blocker für AutoDetect-Preclips
- Webhook endet nicht mehr mit `generation_unknown_error`

## Erwartetes Ergebnis

Die Pipeline soll nicht mehr minutenlang in Sync.so laufen und dann wegen eines internen `generation_unknown_error` abbrechen, sondern saubere Single-Face-Preclips direkt mit dem stabilen AutoDetect-Payload verarbeiten.

<presentation-actions>
  <presentation-open-history>View History</presentation-open-history>
</presentation-actions>

<presentation-actions>
<presentation-link url="https://docs.lovable.dev/tips-tricks/troubleshooting">Troubleshooting docs</presentation-link>
</presentation-actions>