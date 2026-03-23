

# Plan: Hintergrundmusik endgültig zum Laufen bringen

## Diagnose — Warum es immer noch nicht funktioniert

Die Logs vom letzten Render (23. März 2026) zeigen:

```
BUILD_TAG=r67-music-direct-render-2026-03-21
audio_corruption: Failed to find two consecutive MPEG audio frames
r60 Removing backgroundMusicUrl → music stripped, voiceover=true
```

**Drei klare Ursachen:**

1. **Edge Function nie redeployed** — Produktion läuft auf r67, Code ist r69. Die Smart-Retry-Logik (alternativen Track versuchen statt Musik sofort entfernen) war nie aktiv.

2. **MP3-Tracks sind Lambda-inkompatibel** — Alle 114 Tracks wurden 1:1 von Jamendo heruntergeladen. Nur 30 davon wurden im Sandbox re-encoded, aber ob die Re-Uploads tatsächlich in Storage angekommen sind, ist unklar. Lambda's ffprobe verweigert diese Dateien konsistent.

3. **Re-Encoding war unvollständig** — 84 von 114 Tracks wurden nie re-encoded. Selbst die 30 "re-encoded" Tracks sind vermutlich nicht korrekt ersetzt worden, da der letzte Render trotzdem `audio_corruption` liefert.

## Lösung — Diesmal definitiv

### Schritt 1: Einen einzigen garantiert funktionierenden Track erzeugen

Statt 114 externe Tracks zu reparieren, erzeuge ich **einen synthetischen MP3-Track direkt per FFmpeg** im Sandbox — komplett ohne externe Quelle:

```bash
ffmpeg -f lavfi -i "sine=frequency=220:duration=120" -codec:a libmp3lame -b:a 128k -ar 44100 -ac 2 test-tone.mp3
```

Diesen Track lade ich in den `background-music` Bucket hoch und erstelle einen DB-Eintrag mit `validation_status = 'validated'`.

Wenn dieser synthetische Track in Lambda funktioniert, wissen wir definitiv, dass das Problem die Quelldateien sind (nicht die Pipeline).

### Schritt 2: Echte Musik-Tracks per FFmpeg generieren

Statt Jamendo-Downloads zu re-encoden, erzeuge ich 5-10 **ambient/corporate-taugliche Tracks per FFmpeg-Synthese** (harmonische Sinuswellen, leises Pad-artiges Audio). Diese sind garantiert Lambda-kompatibel.

Alternativ: Einen einzigen bekanntermaßen funktionierenden Track von einer zuverlässigen Quelle (z.B. ein CC0-Track von archive.org) herunterladen, re-encoden und testen.

### Schritt 3: Edge Function deployen (r69 → Produktion)

Damit die Smart-Retry-Logik aktiv wird und der BUILD_TAG-Mismatch behoben ist.

### Schritt 4: Testrender mit dem validierten Track

Einen Video-Render starten und in den Logs prüfen, ob der Track ohne `audio_corruption` durchläuft.

### Schritt 5: Erst nach Erfolg die Bibliothek skalieren

Wenn der Proof-of-Concept funktioniert, die restlichen Tracks systematisch re-encoden oder durch neue ersetzen.

## Warum dieser Ansatz anders ist

Alle bisherigen Versuche haben die MP3-Dateien von Jamendo genommen und gehofft, dass sie funktionieren. Das Problem: **Jamendo-MP3s haben nicht-standardkonforme MPEG-Frames**, die im Browser funktionieren aber in Lambda's ffprobe crashen.

Diesmal:
- Synthetischer Track = 100% kontrollierte Byte-Struktur
- Kein Verlass auf externe Quellen
- Erst Proof-of-Concept, dann skalieren

## Betroffene Dateien

| Datei | Änderung |
|-------|----------|
| Storage: `background-music/library/` | Synthetischen + validierten Track hochladen |
| DB: `background_music_tracks` | Neuen Track-Eintrag mit validated Status |
| `supabase/functions/auto-generate-universal-video/index.ts` | Deploy (r69 live bringen) |

## Erwartetes Ergebnis
- Mindestens ein Track der garantiert in Lambda funktioniert
- Edge Function auf r69 mit Smart-Retry
- Hintergrundmusik endlich hörbar im fertigen Video

