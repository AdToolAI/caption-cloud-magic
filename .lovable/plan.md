# V443 — Messfehler von Messergebnis trennen (bounded Re-Measure)

Belegte Ursache auf S11, Plate-Generation 9: Pass 0 hatte einen guten Provider-Output. Die Bewegungsmessung starb an einem Transportfehler (`Unexpected end of JSON input`), das Webhook wertete das als `indeterminate` und terminalisierte über `ssw:noop_fail`. Vier Minuten später ergab dieselbe unveränderliche Datei `delta_mean=130.7` → klar Motion. Die Szene starb also an der Messinfrastruktur, nicht am Lip-Sync.

## Scope

### 1. Zwei getrennte Ausgänge statt einem `indeterminate`
In `_shared/motion-probe-classifier.ts` / `_shared/measure-provider-motion-sync.ts`:
- `probe_infra_error` — leere/abgeschnittene Antwort, JSON-Parse-Fehler, HTTP-/Extraktions-Fehler, Timeout, Transportfehler.
- `measured_ambiguous` — Messung lief durch, Wert liegt in der bestehenden Grauzone. Verhalten unverändert fail-closed.

Schwellenwerte werden nicht angefasst.

### 2. Bounded Re-Measure bei `probe_infra_error`
Erneutes Messen auf demselben v434-gepinnten, unveränderlichen Provider-Output: maximal 2 Versuche mit kurzem Backoff. Keine neue Sync.so-Generierung, kein Provider-Rerender, keine zusätzlichen Credits. Run-/Generation-/Pass-Identität und Artefakt-SHA bleiben identisch.

### 3. `motion_unverified` statt Terminalisierung
Schlägt die Messung auch nach den Wiederholungen aus Infrastrukturgründen fehl:
- Szene wird **nicht** terminalisiert,
- das Segment geht als erfolgreich durch, Telemetriezustand `motion_unverified`,
- Grund wird in `syncso_dispatch_log` persistiert.

Nur ein **gemessenes** Noop darf weiterhin über den bestehenden Noop-Pfad terminalisieren.

### 4. Watchdog-Nachmessung
`lipsync-watchdog` misst einen `motion_unverified`-Pass genau einmal aus demselben unveränderlichen Output nach:
- Motion → Erfolg bleibt,
- Noop → bestehender bewiesener Noop-Terminalisierungspfad,
- erneut Infra-Fehler → bleibt `motion_unverified`, kein neuer Provider-Job.

### 5. Credits
Refund-Logik, Beträge und Idempotenz unverändert.

## Unangetastet (Freeze-Invarianten)
Anchor-Kohärenz, Run-/Generation-Identität, Webhook-Run-Guard, Assignment-Lock, Provider-Vertrag und Dispatch-Semantik, Motion-Schwellen, alle Retry-Schwellen ausserhalb der Mess-Infrastruktur, Mux-Logik, Storage-Policies, Credit-Beträge.

## Regressionstests (permanent)
1. `probe_infra_error` failt die Szene nicht sofort.
2. Genau maximal 2 gebundene Re-Measure-Versuche auf demselben Pin.
3. Erschöpfte Infra-Messung ergibt `motion_unverified`.
4. Kein neuer Provider-Dispatch auf diesem Pfad.
5. Gemessenes Noop failt exakt wie bisher.
6. Gemessenes Motion bleibt Erfolg.
7. Watchdog misst `motion_unverified` genau einmal nach.
8. Refund bleibt idempotent.
9. Bestehende V441-Write-Contract-Tests bleiben grün.

Ausgeführt werden die betroffenen Deno- und vitest-Suites plus Typecheck/Build.

## Deployment
Nur `sync-so-webhook` und `lipsync-watchdog` samt ihrer statisch importierten Shared-Module.

## Ausdrücklich nicht in diesem Gate
Kein S11-Rerender, kein Owner-Render. Der Rerender erfolgt danach genau einmal manuell durch dich.
