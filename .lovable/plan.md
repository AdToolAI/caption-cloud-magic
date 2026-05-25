## Plan

Die neue Meldung kommt nicht von Facebook/Meta, sondern aus unserer eigenen App: Beim Klick auf „Verbinden“ blockiert `ConnectionsTab` Free-Accounts mit dem `PlanLimitDialog`. Gleichzeitig zeigt die UI oben aber einen aktiven Enterprise-Trial an. Das ist ein Widerspruch.

## Änderung

1. **Plan-Gate für Integrationen korrigieren**
   - In `src/components/performance/ConnectionsTab.tsx` die Verbindungssperre so anpassen, dass aktive Trial-Nutzer nicht mehr als Free-Nutzer geblockt werden.
   - Social Connections während des aktiven Trials erlauben, wie es `useTrialAccess()` bereits vorsieht.

2. **Plan-Anzeige vereinheitlichen**
   - `fetchUserPlan()` in `ConnectionsTab` liest aktuell nur `profiles.plan`; die Integrationsseite selbst nutzt zusätzlich `test_mode_plan`.
   - Das wird vereinheitlicht, damit Trial/Test/Enterprise-Status nicht als `free` in der Connection-Logik landet.

3. **Dialog bleibt für echte Free-Nutzer erhalten**
   - Der Upgrade-Dialog wird nicht entfernt, sondern nur dann gezeigt, wenn wirklich kein Trial/paid Zugriff besteht.
   - Danach kann der Facebook OAuth Flow wieder bis zur Meta-Weiterleitung laufen.

## Erwartetes Ergebnis

Beim Klick auf „Facebook verbinden“ erscheint nicht mehr der Upgrade-Dialog, sondern der zuvor reparierte Facebook OAuth-Start wird ausgeführt.