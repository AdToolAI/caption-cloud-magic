# Plan v346 — Lip-Sync-Pipeline wieder deterministisch machen

## Bestätigte Ursache im letzten Lauf

Beim Lauf `7c11bc27…` sind zwei Fehler nacheinander aufgetreten:

1. Der serverseitige Bewegungsprüfer hatte Zugriff auf den Replicate-Key, konnte aber **0 von 4 Frames** aus dem Sync.so-Ergebnis extrahieren. Ergebnis: `motion_verdict=unknown` — also eine fehlgeschlagene Messung, kein nachgewiesener Fehler des Providers.
2. Die Retry-Leiter wechselte daraufhin auf die Variante `coords-pro-box` und entfernte dabei ausdrücklich den vorhandenen Einzelgesicht-Preclip. Unmittelbar danach blockierte das v204-Sicherheitsgate genau diesen Full-Plate-Fallback mit `v204_preclip_required`.

Die Pipeline startet damit einen Retry, den ihr eigenes nächstes Gate garantiert ablehnt. Das erklärt den sichtbaren Ablauf „NOOP-Retry läuft" → „Szene fehlgeschlagen".

## Umsetzung

1. **Bewegungsprüfung reparieren**
   - Die Frame-Extraktion erhält dieselbe robuste Replicate-Anbindung wie die produktiven Extraktionsfunktionen.
   - Einzelne Extraktionsfehler werden mit Provider-Status und Ursache protokolliert, statt still zu verschwinden.
   - Frames werden innerhalb der tatsächlichen Preclip-Dauer abgefragt; Zeitpunkte außerhalb des Clips sind ausgeschlossen.
   - Tests decken String-, Array- und Objekt-Antworten sowie teilweise fehlgeschlagene Frames ab.

2. **Unmöglichen Full-Plate-Retry entfernen**
   - Multi-Speaker-Retries dürfen den vorhandenen Einzelgesicht-Preclip nicht mehr verwerfen.
   - `coords-pro-box` entfällt als Retry-Variante, wenn dafür der Preclip verlassen werden müsste.
   - Ein Retry bleibt im v204/v169-konformen Pfad: derselbe Sprecher, derselbe isolierte Preclip, dieselbe unabhängige Audiospur, keine Provider-Ausgabe als Eingang eines anderen Sprecherpasses.

3. **Klare Behandlung von `unknown`, `static`, `moved`**
   - `moved`: Pass wird abgeschlossen.
   - `static`: höchstens ein zulässiger Preclip-Retry, danach sauberer Fehler mit automatischer Rückerstattung.
   - `unknown`: technischer Wiederholungsversuch der Messung, aber kein Wechsel auf Full Plate und kein Mux.
   - Die widersprüchliche Kennzeichnung „PASS_DONE_SUSPECT" entfällt, da ein unverifizierter Pass nicht mehr als fertig gilt.

4. **Finalen Mux geschlossen halten**
   - Nur bestätigte Passes (`moved`) gelangen in den finalen Video-Mux.
   - Kein Teil-Mux mit vollständigem Voiceover, wenn ein Sprecherpass fehlt oder unverifiziert ist — auch nicht bei ein oder zwei Sprechern.
   - Ausdrücklich erzwungene interne Diagnose-Remuxes bleiben möglich.

5. **Fehleranzeige bereinigen**
   - Nutzer sehen verständliche Meldungen wie „Lip-Sync konnte für Samuel nicht bestätigt werden; Guthaben wurde erstattet".
   - Interne Codes (`v204_preclip_required`, `motion_probe_unavailable`, Variantennamen) bleiben in Telemetrie und Logs.

6. **Regressionstest und selektives Deployment**
   - Testfälle für 0/4, 1/4, 2/4 und 4/4 extrahierte Frames sowie alle drei Verdicts.
   - Vier-Sprecher-Lauf: Jeder Pass behält seinen eigenen Preclip und muss `moved` erreichen, bevor der Mux startet.
   - Nur Bewegungsprüfer, Sync.so-Webhook, Dialog-Dispatch und Audio-Mux deployen.

## Bewusst nicht enthalten

- Keine Änderungen an Crop-Größen, Face-Share-Schwellen, Masken oder Charakter-Prompts.
- Kein Umbau der v169-Parallelarchitektur.
- Keine Absenkung des Bewegungs-Schwellenwerts, um Fehler zu verstecken.