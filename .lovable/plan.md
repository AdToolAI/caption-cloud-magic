## Befund

Der aktuelle Fehler passiert weiterhin vor dem eigentlichen Provider-Dispatch:

- `syncso_replay_log` hat **0 Einträge** → die Funktion bricht vor dem Log-Insert ab.
- Edge-Logs zeigen nur Boot, keine hilfreiche Runtime-Fehlermeldung.
- Die Scene `85e38890...` hat für Pass 0 inzwischen die benötigten Keys `input_url` und `audio_url`, d. h. der erste URL-Fix ist grundsätzlich richtig.
- Sehr wahrscheinlich schlägt jetzt der **Asset-Reachability-Check** fehl oder ein anderer Pre-Insert-Fehler wird in der UI nur als generisches „Edge Function returned a non-2xx status code“ angezeigt.

## Plan

1. **Fehler im UI sichtbar machen**
   - `SyncsoForensicsSheet.tsx` so erweitern, dass Edge-Function-Fehler nicht nur die generische SDK-Message anzeigen.
   - Wenn möglich `error.context` / Response-Body auslesen und als JSON im Replay-Ergebnis anzeigen.
   - Dadurch sehen wir künftig direkt `missing_payload_urls`, `asset_unreachable`, `rate_limited`, `unsupported_model`, etc.

2. **Replay-Funktion robuster vor dem Provider-Dispatch machen**
   - In `syncso-replay/index.ts` die Pre-Dispatch-Checks mit klaren `console.error`-Events versehen.
   - Bei `asset_unreachable` zusätzlich zurückgeben:
     - welche URL-Art betroffen ist (`video` / `audio`)
     - HTTP-Status von HEAD/Range-GET
     - ob der URL leer, abgelaufen oder blockiert wirkt

3. **Reachability-Check weniger fragil machen**
   - Den Check nicht mehr nur als hartes Gate auf `HEAD`/Range-Erfolg behandeln.
   - Falls Sync.so-signierte URLs bei Lovable Storage/S3 HEAD/RANGE blocken, aber normal abrufbar sind, soll die Funktion trotzdem zum Provider dispatchen.
   - Nur echte leere/invalid URLs bleiben harter 400/422-Abbruch.

4. **Danach Replay erneut testen**
   - `omit_sync_mode` erneut dispatchen.
   - Erwartung: Es entsteht mindestens ein Eintrag in `syncso_replay_log` mit `override_preset='omit_sync_mode'`.
   - Dann können wir den echten Provider-Result auswerten: `succeeded`, `provider_unknown_error`, oder ein deterministischer 4xx.

## Nicht im Scope

- Keine Änderung am Live-Dialog-Dispatch.
- Keine Produktions-Strip-Logik für `sync_mode`.
- Keine DB-Migration.
- Keine Wallet-/Refund-/Watchdog-Änderung.