Ich habe die aktuellen Fehlruns geprüft. Die neuen Timeouts passieren nicht mehr wegen zu vieler Missions-Schritte. Alle betroffenen Missionen haben bereits nur 3 Schritte. Der entscheidende Hinweis ist: `duration_ms` liegt nur bei ca. 650–850 ms, `heartbeats: []`, `0 paths`. Das bedeutet: Browserless bricht ab, bevor unser Skript überhaupt startet.

Ursache: In `browserlessClient.ts` wurde der Browserless-`timeout` Query-Parameter zuletzt fälschlich von Millisekunden in Sekunden umgerechnet. Die aktuelle Browserless-Dokumentation sagt jedoch: REST-API-Timeouts sind in Millisekunden. Dadurch schicken wir aktuell `timeout=30` statt `timeout=30000`, was praktisch ein 30-ms-Limit ist. Deshalb kommen sofort 408-Timeouts, obwohl die Mission kurz ist.

Plan zur Behebung:

1. Browserless Timeout-Parameter korrigieren
   - In `supabase/functions/_shared/browserlessClient.ts` den `timeout` Query-Parameter wieder in Millisekunden übergeben.
   - `SERVER_TIMEOUT_SEC` entfernen/ersetzen durch `SERVER_TIMEOUT_MS` im Request.
   - Kommentar und Fehlermeldung korrigieren, damit dort nicht mehr fälschlich steht, Browserless erwarte Sekunden.
   - User-facing Hinweis weiterhin klar halten: Hobby-safe 30s, optional 60s über `BROWSERLESS_SERVER_TIMEOUT_MS`.

2. Diagnose verbessern
   - Wenn Browserless 408 innerhalb von <2s zurückkommt und keine Heartbeats vorhanden sind, soll die Fehlermeldung künftig explizit auf einen externen Browserless-Konfigurations-/Timeout-Startfehler hinweisen statt auf „zu viele Schritte“.
   - Das verhindert, dass wir künftig wieder Missionsinhalt optimieren, obwohl der Request gar nicht gestartet wurde.

3. Edge Function neu deployen und testen
   - `qa-agent-execute-mission` deployen, weil sie den Shared-Client nutzt.
   - Optional zusätzlich prüfen, ob ein Deploy der Shared-Änderung automatisch greift; falls nicht, die abhängige Funktion explizit deployen.
   - Danach eine der fehlgeschlagenen 3-Step-Missionen manuell gegen Browserless testen.

4. Daten bereinigen
   - Die zwei aktuell offenen 408-Bugs (`smoke-01b-creator-tour`, `smoke-02b-tertiary-tour`) als resolved markieren, wenn der Test grün läuft.
   - Den alten `smoke-02-picture-studio-mock` Run hatte noch `steps_total: 5`, also war er vor der Missionsoptimierung gestartet; bei Bedarf ebenfalls neu starten und alte 408-Meldung bereinigen.

5. Memory/Regel aktualisieren
   - Die QA-Agent-Memory ergänzen: Browserless REST `timeout` ist Millisekunden; frühe 408s mit `duration_ms < 2000` und `heartbeats: []` bedeuten Request-Start/Timeout-Konfiguration, nicht Missions-Komplexität.

Erwartetes Ergebnis:
- Die Missionen starten wieder wirklich im Browser.
- `pathResults`/Heartbeats erscheinen wieder.
- Falls danach noch Fehler kommen, sind es echte UI-/Auth-/Netzwerk-Bugs statt der aktuellen künstlichen 30-ms-Timeouts.