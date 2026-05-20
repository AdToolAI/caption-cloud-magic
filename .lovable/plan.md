## Diagnose

Der Backend-Status ist gesund. Der aktuelle Fehler ist wieder Sync.so-seitig:

- Szene `a2bc5281-fa22-484b-a237-4cda3b158762` wurde mit `The segments configuration is invalid.` abgelehnt.
- Auch der automatische Fallback-Job (`lipsync-2`) wurde abgelehnt.
- Die gespeicherte Payload zeigt den wahrscheinlich entscheidenden Fehler: Wir fügen ein `tail_silence`-Segment von `6.316s` bis `8s` hinzu, das auf denselben Audio-Track zeigt, obwohl dort keine echte Sprache mehr liegt. Sync.so akzeptiert Segmente technisch, lehnt aber unsere konkrete Segment-Konfiguration ab.
- Zusätzlich ist `sync-3` laut offizieller Doku zwar ein gültiges Modell, aber die dokumentierten Segments-Beispiele nutzen `lipsync-2`. Der Segments-Pfad ist für diesen Two-Shot-Fall zu fragil.

## Plan

1. **Segments-API aus dem Standardpfad entfernen**
   - Für Szenen mit 2 echten Charakteren nicht mehr `segments[]` verwenden.
   - Kein `tail_silence` mehr an Sync.so senden.
   - Segment-Mode nur noch als Legacy-Erkennung im Poller behalten, damit alte Jobs sauber auslaufen oder fehlschlagen können.

2. **Stabile 2-Pass-Face-Pipeline wieder aktivieren**
   - Pro Sprecher den vorhandenen per-character WAV-Track nutzen (`audio_plan.twoshot.speakers[].track_url`).
   - Pass 1 animiert das linke Gesicht mit Track 1.
   - Pass 2 nimmt das Ergebnis aus Pass 1 und animiert das rechte Gesicht mit Track 2.
   - Face-Ziele kommen aus dem bereits erfolgreichen `faceMap` (`left`/`right`), nicht aus automatischer Erkennung.

3. **Async korrekt machen**
   - `compose-twoshot-lipsync` startet nur den ersten Sync.so-Job, speichert Job-ID + Pass-Status und gibt sofort `202` zurück.
   - `poll-twoshot-lipsync` startet nach Abschluss von Pass 1 automatisch Pass 2.
   - Nach Pass 2 wird das finale Video re-gehostet und die Szene auf `done` gesetzt.

4. **Keine falsche Single-Mouth-Ausgabe**
   - Wenn 2 Sprecher vorhanden sind, aber keine 2 Gesichter erkannt werden, bleibt der Job fehlgeschlagen mit Refund.
   - Kein Single-Pass-Merged-Audio-Fallback für 2 Sprecher.

5. **Bessere Fehlerdiagnose und Refund-Sicherheit**
   - Provider-Responses pro Pass in `audio_plan.twoshot.syncJobs.jobs[]` speichern.
   - Refund bleibt idempotent: nur einmal pro fehlgeschlagenem Job.
   - Fehlertext in der UI bleibt konkret (`pass_1`, `pass_2`, Zielgesicht, Provider-Fehler).

6. **Betroffene Szene zurücksetzen**
   - Szene `a2bc5281-fa22-484b-a237-4cda3b158762` auf `lip_sync_status='pending'` und `twoshot_stage='master_clip'` setzen.
   - Bestehendes Video, FaceMap und Audio-Tracks behalten.
   - Danach kann der Button „Lip-Sync neu rendern“ erneut gestartet werden.

## Technische Änderungen

- `supabase/functions/compose-twoshot-lipsync/index.ts`
  - Two-shot mit 2 Sprechern startet wieder als `mode: 'two_pass'` statt `mode: 'segments'`.
  - Nutzung von `startSyncSoDirectGeneration()` mit `targetCoords` pro Gesicht.
  - Kein langer Polling-Loop im Compose-Handler.

- `supabase/functions/poll-twoshot-lipsync/index.ts`
  - `two_pass` als primärer Modus.
  - Nach `COMPLETED` von Pass 1: Pass 2 starten.
  - Nach `COMPLETED` von Pass 2: finalisieren.
  - Segment-Fallback entfernen bzw. nur noch alte Segment-Jobs defensiv behandeln.

- Datenkorrektur
  - Nur Lip-Sync-Status und stale `syncJobs` der betroffenen Szene zurücksetzen; Assets bleiben erhalten.

## Erwartetes Ergebnis

Der nächste Render nutzt keine problematische Sync.so-Segments-Konfiguration mehr. Stattdessen wird pro Gesicht gezielt ein eigener Sprecher-Track angewendet, wodurch beide Personen sichtbar bleiben und nicht beide Stimmen aus einem Mund kommen.