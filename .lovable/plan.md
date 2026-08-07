# Fehler „Lock … auth-token was released because another request stole it" beim Facebook-Verbinden

## Was der Fehler bedeutet

Das ist kein Facebook- und kein Berechtigungsfehler. Die Meldung stammt aus der Auth-Bibliothek im Browser: Mehrere Stellen der Seite fragen **gleichzeitig** die Sitzung ab bzw. erneuern sie. Der interne Sperrmechanismus (Web Lock auf den Auth-Token) bricht den langsameren Aufruf ab und wirft genau diesen Text.

Belegt aus dem Code: Auf der Verbindungsseite gibt es allein in `ConnectionsTab.tsx` neun Stellen mit `getSession()` bzw. `refreshSession()` (Zeilen 96, 302, 353, 382, 410, 443, 542, 602, 780). Parallel dazu ruft das Diff-Panel `ensureValidSession()` auf, das selbst `getSession` + `getUser` + ggf. `refreshSession` ausführt. Beim Klick auf „Verbinden" startet zusätzlich eine Sitzungserneuerung — die Kollision ist damit erwartbar.

Nicht belegt: dass dadurch die Verbindung selbst fehlschlägt. In der Regel wird nur der Toast angezeigt, während der eigentliche Ablauf weiterläuft oder abbricht, bevor die Weiterleitung startet.

## Umsetzung

1. **Sitzungsabfrage bündeln (Single-Flight)**
   - `src/lib/ensureSession.ts` um eine gemeinsam genutzte, laufende Promise erweitern: parallele Aufrufer bekommen dasselbe Ergebnis, statt jeweils eigene Token-Erneuerungen zu starten.
   - Lock-Fehler (`Lock ... was released`, `Navigator LockManager`) werden erkannt und als „bitte kurz erneut versuchen" behandelt — mit einem einzigen automatischen Wiederholungsversuch statt einer Fehlermeldung.

2. **Verbindungsseite auf den gemeinsamen Helfer umstellen**
   - Alle direkten `getSession()`/`refreshSession()`-Aufrufe in `ConnectionsTab.tsx` durch `ensureValidSession()` ersetzen, damit auf dieser Seite nur noch ein Auth-Zugriff gleichzeitig läuft.
   - Kein zusätzliches `refreshSession()` unmittelbar vor dem OAuth-Start; der Helfer erneuert nur, wenn wirklich nötig.

3. **Fehler nicht mehr fälschlich als Verbindungsfehler anzeigen**
   - Im Fehler-Toast der Verbindungsaktionen Lock-Meldungen abfangen und stattdessen einen verständlichen Hinweis zeigen („Sitzung wurde gerade aktualisiert — bitte erneut auf Verbinden klicken"), statt der technischen Bibliotheksmeldung.

4. **Abnahme**
   - Verbindungsseite öffnen, während das Diff-Panel geladen ist, und „Mit anderem Facebook-Konto verbinden" klicken: es darf kein Lock-Toast mehr erscheinen und die Weiterleitung zu Facebook muss starten.

## Technische Details

- `src/lib/ensureSession.ts`: modul-globale `inFlight`-Promise, Lock-Fehlererkennung, ein Retry mit kurzem Backoff, Rückgabe wie bisher (`Session | null`).
- `src/components/performance/ConnectionsTab.tsx`: neun Auth-Aufrufe auf `ensureValidSession()` vereinheitlichen; Fehlerbehandlung in `handleConnect`/`handleSync` um die Lock-Ausnahme ergänzen.
- `src/lib/translations.ts`: neuer Hinweistext DE/EN/ES.
- Keine Änderung an Edge Functions, Scopes oder der Datenbank.
