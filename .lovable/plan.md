
# Plan: Briefing→Storyboard 1:1-Übertragung verifizieren

Ziel: Beweisen (nicht nur behaupten), dass **alle** Briefing-Felder im Storyboard ankommen — über echte Logs, DB-Inspektion und einen sichtbaren UI-Check.

## Was bereits implementiert ist (zur Referenz)
- `briefing-deep-parse` extrahiert: script, performance (expression/gesture/gaze/energy), actionBeat, framing, lighting, music, transitions, overlays, per-cast shotType, language.
- `useApplyProductionPlan` schreibt alle Felder in `composer_scenes`.
- `driftDetector` validiert nach Apply.
- `buildInvokePrompt` injiziert performance+actionBeat in den Single-Scene-Invoke.
- v174 Reliability: Flash-first Pass A mit Retry-Chain, soll Fallback-Quote auf <1 % drücken.

## Schritt 1 — Reality-Check via Logs (kein Code, nur Beobachtung)
- Edge-Logs von `briefing-deep-parse` der letzten 24h auswerten: Wie oft `Pass A success` (Flash), wie oft Fallback zu Pro/Flash-Lite, wie oft kompletter 5xx → Client-Fallback?
- Konkrete Latenzen messen, ob die 8–25s-Annahme stimmt.
- Falls Pro öfter als erwartet greift: Token-Budget weiter senken oder Pass A in 2 kleinere Passes splitten.

## Schritt 2 — DB-Inspektion einer echten geparsten Szene
- Letzten erfolgreichen Eintrag aus `composer_production_plans` ziehen (wo `meta->>'source' = 'deep_parse'`).
- Verifizieren, dass für **jede** Szene gefüllt sind: `script`, `performance` (alle 4 Sub-Felder), `actionBeat`, `framing`, `lighting`, `transitions`, `overlays`, per-cast `shotType`.
- Den zugehörigen `composer_scenes`-Eintrag nach `useApplyProductionPlan` prüfen — ist 1:1 angekommen, oder droppt der Apply-Pfad still Felder?

## Schritt 3 — Drift-Report sichtbar machen
Aktuell läuft `driftDetector` nach Apply, das Ergebnis landet in der Konsole. Ich schlage vor (kleine UI-Erweiterung, nicht in diesem Plan-Step umgesetzt — würde erst nach Freigabe gebaut):
- Im `ProductionWarRoom` nach „Apply" eine **„Mapping-Report"-Karte** zeigen: pro Szene grün/gelb/rot pro Feld, plus „X von Y Briefing-Feldern übernommen".
- So sieht der User sofort, wenn z. B. `overlays` zwar im Plan steht, aber im Storyboard nicht ankommt.

## Schritt 4 — Falls Lücken gefunden werden
Erst dann gezielt patchen — kein vorgezogenes „defensives" Code-Schreiben. Mögliche Stellen:
- `useApplyProductionPlan.ts` — Schreibpfad für ein Feld vergessen?
- `composer_scenes`-Spalte fehlt für ein neues Plan-Feld?
- `buildInvokePrompt` schickt das Feld nicht weiter?

## Was NICHT angefasst wird
- Lipsync-Pipeline, Sync.so, dialog_shots, HappyHorse Green-Net, Hailuo-Duration-Lock — alle unverändert.
- Prompts/Tool-Schemas in `briefing-deep-parse` — bleiben 1:1.

## Erwartetes Ergebnis
Eine ehrliche Antwort auf deine Frage in 2 Sätzen plus Beweis: „Ja, alle 11 Felder kommen an, hier ist ein Beispiel aus der DB" — oder „Felder X und Y droppen, weil Z, hier der Fix."

## Freigabe-Frage
Soll ich Schritt 1+2 jetzt ausführen (nur Read-Only: Logs + DB-Query) und dir das Ergebnis berichten, bevor wir über UI-Erweiterungen oder Patches entscheiden?
