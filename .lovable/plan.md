## Ziel
Die Lip-Sync-Pipeline wird wieder auf die aktuelle Sync.so-3-Dokumentation ausgerichtet und die aktuelle 95%-Hänge-Situation wird nicht weiter durch Heuristik-Retries kaschiert.

## Befund
- Die offizielle Sync.so-Doku sagt jetzt klar: `segments[].optionsOverride.active_speaker_detection` ist unterstützt.
- Unser Code-Kommentar und Teile der Architektur basieren noch auf der alten Annahme, dass Active-Speaker-Detection nur top-level möglich ist.
- Aktuelle Live-Szene `0207e3a4...` hängt bei v5-Fanout: Pass 1 ist nach `bbox-url-pro`/`coords-pro` wieder in `retrying`, während Pass 4 bereits dispatched ist. Dadurch ist die State-Machine weiterhin anfällig für Zombie-/Mischzustände.
- Der Payload ist formal fast doc-strict (`model: sync-3`, `input`, `options.sync_mode`, `active_speaker_detection`; keine `temperature`/`occlusion_detection_enabled`), aber die Pipeline weicht strukturell von der aktuellen Doku ab, weil wir Multi-Speaker weiter über chained per-pass full/preclip calls statt über dokumentierte Segmente mit per-segment `optionsOverride` behandeln.

## Plan

### 1. Sync.so-3 Payload-Builder korrigieren
- In `compose-dialog-segments/index.ts` eine neue doc-current Dispatch-Route einführen:
  - `model: "sync-3"`
  - `input`: ein Video + mehrere Audio-Inputs mit eindeutigen `refId`s
  - `segments`: je Sprecher-/Turn-Fenster mit `audioInput.refId`
  - `segments[].optionsOverride.active_speaker_detection` pro Segment setzen
  - `options.sync_mode` nur top-level setzen, ohne sync-3-unsupported Optionen
- Segment-ASD bevorzugt mit `frame_number + coordinates`; `bounding_boxes_url` nur nutzen, wenn es exakt zur Dispatch-Video-Zeitbasis passt.

### 2. Alte falsche Annahme entfernen
- Den Kommentar/Invariant entfernen oder korrigieren, der behauptet, Sync.so habe keine segmentweise ASD.
- Die Retry-Ladder so ändern, dass sie nicht mehr von `bbox-url-pro → coords-pro → coords-pro-box` auf Full-Plate zombie-routet, wenn Sync.so bereits `provider_unknown_error` zurückgibt.

### 3. Audio-Diagnostik auf tatsächliche Payload-Audio-Datei umstellen
- `audioDiagnostics` aktuell vor dem Tight-Slicing auf Vollspur-WAVs basiert und dadurch Live-Logs irreführend 9s/Lead-In zeigen.
- Nach dem Tight-Slicing eine zweite, payload-nahe Diagnose loggen:
  - tatsächliche Payload-Audio-Dauer
  - voiced seconds
  - lead-in
  - Audio-vs-Video-Window-Abgleich
- Guards auf diese tatsächliche Payload-Audio-Datei stützen, nicht auf die alte Vollspur.

### 4. Zombie-State hart schließen
- Wenn ein Pass `provider_unknown_error` zweimal mit doc-current Payload liefert, wird nicht mehr weiter zwischen Full-Plate/Preclip hin- und hergeschaltet.
- Szene wird terminal `failed`, alle offenen/inflight Sync.so Jobs werden freigegeben, Credits werden idempotent erstattet.
- Watchdog bleibt als letzte Sicherung, aber die State-Machine soll bereits im Webhook terminal entscheiden.

### 5. Live-Szene bereinigen
- Die aktuelle hängende Szene `0207e3a4...` nach dem Patch sauber terminal markieren/refunden oder zurücksetzen, damit ein neuer Render die korrigierte Route nutzt.

## Technische Details
- Hauptdateien:
  - `supabase/functions/compose-dialog-segments/index.ts`
  - `supabase/functions/sync-so-webhook/index.ts`
  - `supabase/functions/lipsync-watchdog/index.ts`
  - neues Memory-Dokument zur Sync.so-3-doc-current-Pipeline
- Keine UI-Änderung.
- Keine Provider-/Key-Änderung.
- Keine Migration geplant, außer beim Implementieren zeigt sich, dass ein Status-/Log-Feld strukturell fehlt.

## Validierung
- Edge-Function-Logs müssen zeigen, dass der ausgehende Payload der aktuellen Doku entspricht: `segments[].optionsOverride.active_speaker_detection` vorhanden, keine sync-3-unsupported Optionen.
- Eine neue Testausführung darf nicht mehr bei 95% hängen bleiben; sie muss entweder abgeschlossen oder sauber terminal failed + refunded sein.