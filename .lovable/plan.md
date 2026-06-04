## Diagnose

Der aktuelle Fehler ist nicht mehr der alte Lambda-Bundle-Seek-Fehler. Die Logs zeigen eine neue Schwachstelle in v39:

- Szene `0272076d-33db-42b9-9cd6-948289b1fce6`
- Sprecher 1 und 2 wurden fertig.
- Sprecher 3 `Kailee` scheitert mehrfach mit Sync.so `An unknown error occurred.`
- Der kritische Log-Hinweis ist: `v39_tight_audio_failed: sliceWav: no valid windows`.

**Do I know what the issue is?** Ja.

Die v39-Pipeline mutiert `pass.audio_url` von der ursprünglichen, zeitlich korrekt gepaddeten Sprecher-Spur auf eine kurze `tight`-WAV. Beim Retry wird diese kurze WAV dann erneut mit absoluten Zeitfenstern wie `3.81–7.082s` geschnitten. Das kann nicht funktionieren, weil die kurze WAV nur ca. `3.27s` lang ist. Danach fällt die Pipeline in einen hybriden Fallback zurück: kurze/verschobene Audio-Datei + Full-Plate/`segments_secs` + absoluter `frame_number`. Das ist nicht mehr Sync.so-konform stabil.

Die offizielle Sync.so-Dokumentation bestätigt den besseren Weg:

- Multi-Speaker soll über top-level `segments` laufen.
- Pro Segment wird `audioInput.refId` gesetzt.
- Pro Segment wird `optionsOverride.active_speaker_detection` gesetzt.
- `frame_number + coordinates` sollen nur ein sichtbares Gesicht referenzieren, nicht als Timing-Anker missbraucht werden.

## Plan

### 1. v40: Sync.so-konformer Segment-Payload

In `compose-dialog-segments` ersetze ich den fragilen v39-Hybrid für 3+ Sprecher:

Aktuell problematisch:

```text
video input: full plate oder segments_secs
input audio: mutierte tight wav
options.active_speaker_detection: absoluter frame_number
sync_mode: cut_off
```

Neu:

```text
input:
  - full video plate
  - original full-length per-speaker wav mit refId
segments:
  - startTime/endTime des Sprecher-Turns
  - audioInput: { refId, startTime, endTime }
  - optionsOverride.active_speaker_detection für genau diesen Sprecher
options:
  - keine globale Timing-Hacks mehr
```

Damit bleibt die Audio-Zeitachse absolut korrekt, Sync.so bekommt aber trotzdem nur den relevanten Segmentbereich.

### 2. Canonical Audio nie wieder überschreiben

Ich trenne künftig strikt:

- `audio_url`: immer die originale, full-length, silence-padded Sprecher-Spur
- `prepared_audio_url` / `audio_tight`: nur temporäre Diagnose oder Legacy-Fallback
- Retry-Pfade starten immer wieder von der originalen Sprecher-Spur

Damit kann ein Retry nicht mehr versehentlich eine bereits getrimmte Datei erneut mit absoluten Fenstern schneiden.

### 3. Sprecher-Frame korrekt wählen

Ich ändere die ASD-Logik so, dass `frame_number` wieder ein stabil sichtbarer Frame des jeweiligen Gesichts ist, idealerweise aus der bestehenden Face-Validation / Segmentmitte. Das Segment selbst übernimmt das Timing. Der Frame ist nur für Speaker Selection da.

### 4. 3+ Sprecher: Filmreifer Qualitätsmodus

Für 3+ Sprecher in einer Gruppenaufnahme nutze ich `sync-3` als Primärmodell statt erst nach zwei fehlgeschlagenen Pro-Retries. Sync.so empfiehlt `sync-3` für komplexe Multi-Person-, statische, verdeckte oder schwierige Winkel-Szenen.

1–2 Sprecher bleiben auf `lipsync-2-pro`, außer sie fallen in bekannte Problemfälle.

### 5. Fallback-Ladder vereinfachen

Ich entferne für 3+ Sprecher die instabilen Misch-Fallbacks:

- keine `auto-pro` / `auto-standard` Fallbacks, die falsche Gesichter wählen können
- keine erneute Tight-WAV-Slice-Kette auf Retry
- kein `segments_secs`-Fallback, wenn top-level `segments` möglich ist

Fallbacks werden:

```text
sync-3 + segment ASD
→ lipsync-2-pro + segment ASD, falls sync-3 API-seitig scheitert
→ hard fail + Refund, wenn Face/Audio/Provider ungültig ist
```

### 6. Aktuelle Szene sauber zurücksetzen

Nach dem Code-Fix:

- betroffene Szene `0272076d-33db-42b9-9cd6-948289b1fce6` zurücksetzen
- alte mutierte `pass.audio_url`-States ignorieren/normalisieren
- Edge Functions deployen
- neuen Lauf starten lassen

### 7. Verifikation

Ich prüfe danach:

- Logs enthalten `v40_official_segments_payload`
- jeder Sprecher-Pass verwendet originale full-length Audio-Quelle mit `refId`
- `segments[]` enthält die korrekten Sprecherfenster
- keine `sliceWav: no valid windows` Logs mehr
- finaler Mux startet erst, wenn alle 3 Sprecher `done` sind

## Betroffene Dateien

- `supabase/functions/compose-dialog-segments/index.ts`
- `supabase/functions/sync-so-webhook/index.ts` falls Retry-Ladder angepasst werden muss
- optional `supabase/functions/render-sync-segments-audio-mux/index.ts` nur wenn `sourceTiming` für die neue v40-Ausgabe markiert werden muss
- Memory-Dokumentation für v40