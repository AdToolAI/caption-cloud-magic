## Befund

- Der Backend-Status ist gesund; der Abbruch kommt nicht von Lovable Cloud selbst.
- In den aktuellen Szenen scheitert weiterhin genau ein Turn mit `sync_FAILED: An unknown error occurred`, obwohl die anderen Turns fertig werden.
- Auffällig: Der Webhook-Retry berechnet `frame_number_override` noch absolut aus der Master-Timeline, während `poll-dialog-shots` bereits segment-relative Frames nutzt. Das kann bei Sync.so mit `segments_secs` wieder out-of-range werden.
- Zusätzlich ist die Pipeline aktuell zu hart: Ein einzelner Sync.so-Unknown-Error nach nur einem Retry setzt die ganze Szene auf failed/refunded, statt provider-typisch länger/alternativ weiterzulaufen.
- Der vom User beobachtete 15-Minuten-Abbruch passt zu: mehrere serielle Provider-Jobs + Retry + Timeout/Failure-Guard, nicht zu einem normalen Lambda-Stitch-Problem.

## Plan

1. **Webhook-Retry korrigieren**
   - `sync-so-webhook/index.ts`: `prepareRetryFromWebhook()` so ändern, dass `frame_number_override` segment-relativ berechnet wird.
   - Dafür `render_window ?? window` verwenden und auf die Segmentlänge clampen, analog zu `poll-dialog-shots`.
   - Damit erzeugt der schnelle Webhook-Pfad nicht wieder dieselbe falsche absolute Frame-Logik.

2. **Robustere Sync.so-Retry-Strategie**
   - `poll-dialog-shots/index.ts`: für `sync_FAILED: An unknown error occurred` nicht nach einem Versuch terminal abbrechen.
   - Mehrere Provider-sichere Retry-Varianten pro Turn einführen, z. B.:
     - coords, Segment-Mitte
     - coords, Segment bei 25% / 75%
     - leicht andere `temperature`
     - nur als letzter Ausweg Auto-Detect bei Single-Speaker; bei Multi-Speaker weiterhin nicht blind auf falsches Gesicht fallen.
   - Retry-Status im Shot speichern, ohne Schema-Migration, z. B. über bestehende JSON-Felder.

3. **Timeout nicht zu früh finalisieren**
   - Per-Shot-Watchdog von starrer „8 Minuten = failed“ auf „Retry/Deferred zuerst, terminal erst nach mehreren Strategien oder längerer Provider-Stall-Zeit“ ändern.
   - UI/DB bleibt währenddessen `running`, nicht sofort `failed`.
   - Refund weiterhin nur bei finalem, nicht-recoverbarem Abbruch.

4. **Kurze Turns provider-tauglicher machen**
   - Für sehr kurze Sätze (< ca. 1.2s) render window minimal stabilisieren, damit Sync.so genug Frames/VAD-Kontext bekommt.
   - Audio bleibt weiterhin vorgetrimmt; nur das Videofenster wird vorsichtig erweitert und an Nachbar-Turns geclamped.

5. **Bessere Diagnose persistieren**
   - Fehlerdetails und Retry-Strategie im `dialog_shots.shots[]` JSON speichern: Strategie, frame number, window, job id, provider body soweit verfügbar.
   - Dadurch sehen wir beim nächsten Fehler nicht nur „unknown“, sondern welcher Pfad tatsächlich gebrochen ist.

6. **Deploy und Reproduktion**
   - `poll-dialog-shots` und `sync-so-webhook` deployen.
   - Die zuletzt fehlgeschlagene Szene erneut in einen sauberen pending/running-Zustand setzen und `compose-dialog-scene` neu anstoßen.
   - Validieren: alle Shots `ready`, danach `dialog_stitching`, finaler `clip_url` mit externem Master-Audio.

## Nicht im Scope

- Kein Wechsel des Providers.
- Keine UI-Änderungen.
- Keine neue Datenbanktabelle; wir nutzen die vorhandenen JSON-Felder in `dialog_shots`.