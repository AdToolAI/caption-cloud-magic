# Testkauf geprüft: Guthaben ist da, die Endlos-Meldung ist ein UI-Fehler

## Befund (in der Datenbank geprüft)

- Der Kauf über `info@useadtool.ai` wurde **korrekt gebucht**: eine einzige Buchung `purchase 10.00 USD` am 03.09.2026, 15:28:51.
- Der Kontostand steht jetzt auf **277,68 $** (vorher 267,68 $ — genau +10). Es gibt **keine** Doppelbuchung.
- Die Gutschrift-Funktion in der Datenbank ist idempotent: dieselbe Stripe-Sitzung wird nur einmal verbucht, jeder weitere Aufruf gibt nur den bestehenden Kontostand zurück.

Die Meldung „Credits successfully added!" erscheint also in Dauerschleife, obwohl **nur einmal** gebucht wurde. Der Fehler liegt rein in der Oberfläche.

## Ursache

Auf der Studio-Seite prüft ein Effekt die Rückkehr-Parameter `payment=success&session_id=…` aus der URL. Zwei Punkte lassen ihn immer wieder feuern:

1. Die Parameter bleiben nach der Rückkehr dauerhaft in der URL stehen.
2. Der Effekt hängt an Werten, die bei jedem Render neu entstehen (Übersetzungsfunktion, Wallet-Refetch). Jeder Render löst damit einen neuen Bestätigungsaufruf und einen neuen Toast aus.

## Was ich ändere

- Die Bestätigung läuft **genau einmal pro Stripe-Sitzung** (Merker auf die Session-ID, kein erneuter Aufruf beim Neu-Rendern).
- Nach erfolgreicher Bestätigung werden `payment` und `session_id` aus der URL entfernt, damit ein Reload nichts erneut auslöst.
- Der Erfolgs-Toast bekommt eine feste ID, sodass er sich nicht stapeln kann; der Kontostand wird einmal aktualisiert.
- Gleiche Behandlung für den Abbruch-Fall (`payment=canceled`).

## Was unberührt bleibt

Preise, FX 1,15, Creator-Rabatt, Guthaben-Ledger, Refunds, Stripe-Funktionen (kein Redeploy nötig), Video- und Lip-Sync-Pipeline.

## Technisch

- `src/pages/AIVideoToolkit.tsx`: Effekt umstellen auf `useRef`-Guard pro `session_id`, `setSearchParams` zum Bereinigen, `toast.success(..., { id })`.
- Prüfen, ob `/billing` denselben Rückkehr-Parameter verarbeitet; falls ja, dort dieselbe Absicherung.
- Prüfung: Typecheck, Build, Reload-Test mit gesetzten Rückkehr-Parametern.
