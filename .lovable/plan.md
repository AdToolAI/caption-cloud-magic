## Ziel
Sync.so darf bei HappyHorse/Lip-Sync nicht mehr als opaque `unknown error` hängen bleiben. Wir härten den Multi-Pass-Dispatch ab, loggen provider-taugliche Diagnosedaten und bauen Fallbacks, statt HappyHorse als Problem zu behandeln.

## Plan

1. **Sync.so-Diagnose verbessern**
   - Im `compose-dialog-segments` Dispatch pro Pass einen stabilen `diagnostic_id` erzeugen.
   - In `syncso_dispatch_log.meta` speichern: Pass-Index, Job-ID, Input-Video-URL, Audio-URL, Content-Type, Bytes, geschätzte Dauer, Face-Koordinaten, Frame-Nummer, Sync.so-Options, Retry/Advance-Status.
   - Im Webhook bei `FAILED` den kompletten Sync.so-Payload mit `diagnostic_id`, aktuellem Pass und Input-Summary persistieren, damit man später genau sieht, welcher Input Sync.so gekillt hat.

2. **Preflight gegen bekannte Sync.so-Unknown-Error-Ursachen**
   - Per-Speaker-Audio vor Dispatch genauer validieren: WAV-Header/Dauer prüfen, VAD/Voice-Anteil prüfen, Audio-Länge gegen Szene vergleichen.
   - Bei zu kurzem/silent/kaputtem Audio nicht zu Sync.so senden, sondern klaren Fehler setzen und Credits refundieren.
   - Face-Koordinaten vor Dispatch clamping/validieren statt rohe Werte zu senden.

3. **Provider-Fallback-Kaskade für `provider_unknown_error`**
   - `unknown error` nicht sofort final failen, sondern kontrolliert retryen mit Varianten:
     1. gleicher Payload erneut,
     2. falls wieder fail: ohne `active_speaker_detection`/mit `auto_detect` als Analyse-Fallback,
     3. falls Pro-Modell weiter failt: fallback auf `lipsync-2` für den betroffenen Pass.
   - Jeder Versuch wird geloggt, damit wir sehen, welche Variante funktioniert.
   - Refund bleibt idempotent, falls alle Varianten scheitern.

4. **Status/Progress klarer machen**
   - `twoshot_stage` und `dialog_shots` bekommen `retry_variant`/`last_sync_error_class`, damit UI/Logs nicht nur „Lipsync läuft“ zeigen.
   - Fortschrittsanzeige soll tatsächliche `total_passes` nutzen und nicht „1/3“ anzeigen, wenn Sync.so nur 2 Speaker-Pässe fährt.

5. **Console-Warnung separat fixen**
   - `AIArsenalShowcase` `ModelTile` auf `forwardRef` umstellen, weil Framer Motion `AnimatePresence mode="popLayout"` refs an Children gibt. Das ist nicht die Sync.so-Ursache, aber der sichtbare Console-Fehler wird damit entfernt.

## Nicht ändern
- HappyHorse bleibt ein gültiges Lip-Sync-Modell.
- Kein automatisches Entfernen von HappyHorse aus dem Dialog-Dropdown.
- Kein stilles Umschreiben auf andere Modelle als „Lösung“ für Sync.so; Fallbacks betreffen nur Sync.so-Payload/Modellvariante pro Pass.

## Validierung
- Logs prüfen: neuer `diagnostic_id` + passgenaue Inputdaten vorhanden.
- Eine 2-Sprecher-Dialogszene neu rendern: bei Sync.so-Fail muss Retry/Fallback sichtbar und nachvollziehbar sein; bei Erfolg final `clip_status='ready'`, `lip_sync_status='applied'`.
- Console prüfen: `Function components cannot be given refs` darf nicht mehr erscheinen.