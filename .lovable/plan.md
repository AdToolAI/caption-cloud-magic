# Plan v254 — `attempt`-TDZ endgültig beheben

## Diagnose
Der lokale Code enthält die Hoist-Änderung bereits korrekt: `let attempt = 0;` steht vor den Face-Gate-Logs, und die Retry-Schleife nutzt dieselbe Variable weiter.

Die Live-Logs zeigen aber weiterhin den alten Crash und keinen `v253`-Marker. Das bedeutet: Die laufende Edge-Function bedient noch ein altes Deployment/Bundle oder der Crash kommt aus einem zweiten früheren `attempt`-Scope, der in der kompilierten Bundle-Zeile anders gemappt ist. Deshalb reicht „nur nochmal rendern“ nicht zuverlässig.

## Umsetzung
1. **Version eindeutig bumpen**
   - `COMPOSE_DIALOG_SEGMENTS_VERSION` von `v249-preclip-metrics-persisted` auf `v254-attempt-tdz-hardlock` setzen.
   - Startup-/Dispatch-Logs damit eindeutig erkennbar machen.

2. **TDZ fail-safe härten**
   - Den `attempt`-Zähler noch früher im Dispatch-Pass-Scope deklarieren, nicht erst direkt vor dem Face-Gate-Block.
   - Dadurch ist er garantiert für alle Preflight-, Face-Gate-, Log- und Provider-Dispatch-Pfade initialisiert.
   - Die Retry-Schleife setzt dann nur noch `attempt = 0`, ohne neue Deklaration.

3. **Deployment erzwingen**
   - `compose-dialog-segments` neu deployen.
   - Danach Logs auf `v254-attempt-tdz-hardlock` prüfen.

4. **Verifikation**
   - In den Edge-Logs darf kein neuer Eintrag `Cannot access 'attempt' before initialization` mehr erscheinen.
   - Stattdessen muss beim nächsten Neu-Rendern entweder ein regulärer Face-Gate-/Dispatch-Log oder ein fachlicher Fehler erscheinen.
   - Falls noch ein fachlicher Fehler kommt, analysieren wir ihn separat; der TDZ-Crash ist dann nicht mehr der Blocker.

## Technische Details
- Datei: `supabase/functions/compose-dialog-segments/index.ts`
- Keine Datenbankänderung.
- Keine Preis-/Credit-Änderung.
- Keine Änderung am eigentlichen Lip-Sync-Verhalten, nur Scope/Deployment-Härtung und eindeutige Versionierung.