## Befund

Der aktuelle Run läuft weiterhin rot, weil Flow 2 nicht beim Triggern scheitert, sondern erst danach beim Polling:

- `render-directors-cut` startet zunächst erfolgreich und gibt `render_id` + `remotion_render_id` zurück.
- Kurz danach schreibt der Remotion-Webhook den Render-Job als `failed` in `director_cut_renders`, mit `Error: AWS Concurrency limit reached (Original Error: Rate Exceeded.)`.
- `qa-weekly-deep-sweep` klassifiziert aktuell jeden `director_cut_renders.status = failed` im Polling automatisch als `failed`, auch wenn die Fehlermeldung eindeutig ein temporäres AWS-Lambda-Concurrency-Limit ist.

Zusätzlich sehe ich zwei Nebenprobleme:

1. Der Run zählt intern `flows_total = 7`, obwohl aktuell nur 6 Flow-Slots im UI und in der Ausführung existieren. Deshalb wird `4/7 (57%)` angezeigt statt sinnvoll `4/6` bzw. `4/5`, wenn ein Timeout separat gezählt wird.
2. Flow 4 (Talking Head) wird gar nicht als Ergebnis gespeichert, obwohl `generate-talking-head` laut Logs mit `No face detected` scheitert. Die Funktion setzt dafür `status = skipped`, aber der Status-Typ/Counter kennt `skipped` nicht sauber. Dadurch verschwindet Flow 4 aus dem aktuellen Run.

## Plan

### 1. Throttle-Erkennung zentralisieren

In `qa-weekly-deep-sweep/index.ts` baue ich eine gemeinsame Helper-Funktion ein, z.B. `isLambdaThrottleMessage(message)`, die alle bekannten Varianten erkennt:

- `Rate Exceeded`
- `AWS Concurrency limit reached`
- `TooManyRequestsException`
- `ThrottlingException`
- `HTTP 429`
- `RATE_LIMIT_EXCEEDED`
- deutsche Texte wie `Render-Kapazität` / `vorübergehend erschöpft`

Diese Helper-Funktion wird sowohl beim direkten Trigger-Fehler als auch beim Polling-Fehler verwendet.

### 2. Flow 2 Polling-Fehler korrekt als `timeout` klassifizieren

In `flowDirectorsCutRender` ändere ich die Polling-Auswertung:

- Wenn `director_cut_renders.status = completed`: bleibt `success`.
- Wenn `status = failed` und `error_message` ein Lambda-Throttle ist: `timeout`, nicht `failed`.
- Wenn `status = failed` mit echtem Render-/Codefehler: weiterhin `failed`.
- Wenn der Render nach 90s noch nicht fertig ist: weiterhin `timeout`.

Damit wird der aktuelle Fehler nicht mehr rot als Code-Bug angezeigt, sondern gelb als temporäres Infrastruktur-Limit.

### 3. Optionalen Quick-Fix für QA-Render: Single-Lambda erzwingen

Für den Deep-Sweep-Director's-Cut-Test ist Geschwindigkeit weniger wichtig als Stabilität. Deshalb sende ich beim QA-Call an `render-directors-cut` ein internes Flag, z.B. `qa_stability_mode: true` oder `max_lambda_workers: 1`.

In `render-directors-cut/index.ts` bzw. der Payload-Normalisierung wird dieses Flag genutzt, um für diesen 10s-Test `framesPerLambda = durationInFrames` zu setzen. Ergebnis: Der QA-Render nutzt nur 1 Lambda-Worker statt 3 und kollidiert deutlich seltener mit laufenden Composer-/Remotion-Jobs.

Falls wir das minimaler halten wollen, kann ich Schritt 3 weglassen; meine Empfehlung ist aber, ihn einzubauen, weil reine Klassifizierung den roten Status verhindert, aber den Render nicht stabiler macht.

### 4. Flow-Gesamtzahl und Status-Counter reparieren

Ich passe `flows_total` von `7 - skipFlows.length` auf die echte Anzahl `6 - skipFlows.length` an.

Außerdem wird `skipped` als gültiger Flow-Status sauber behandelt oder in `budget_skipped` normalisiert. Dadurch verschwindet Flow 4 nicht mehr aus dem Run, sondern erscheint sichtbar als skipped/soft-skip, falls HeyGen kein Gesicht erkennt.

### 5. UI-Anzeige in `DeepSweepTab.tsx` korrigieren

Ich passe die Anzeige an:

- Überschrift: `Aktueller Run — 6 Flows`
- Pass-Rate: Timeouts separat behandeln oder klar anzeigen, damit ein Infrastruktur-Timeout nicht wie ein roter Failure wirkt.
- Flow 2 bei Lambda-Throttle: gelber `timeout` Badge mit erklärendem Tooltip.
- Flow 4 bei No-Face: sichtbarer Skip-/Warn-Badge statt leerer Zeile.

## Erwartetes Ergebnis nach dem Fix

Beim nächsten Deep Sweep sollte Flow 2 entweder:

- grün durchlaufen, weil der QA-Render weniger Lambda-Worker nutzt, oder
- gelb als `timeout` erscheinen, falls AWS gerade trotzdem throttelt.

Er sollte nicht mehr rot als harter Code-Fehler erscheinen, solange die Ursache `Rate Exceeded` / Lambda-Concurrency ist.

Außerdem sollte die Run-Anzeige nicht mehr `4/7` zeigen, sondern die echte Flow-Anzahl korrekt widerspiegeln.