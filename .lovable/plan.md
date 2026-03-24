
Ich habe es geprüft.

Was ich verifiziert habe
- `health-x` antwortet mit `ok: true`. Die X-Secrets sind also vorhanden; es ist kein fehlender API-Key.
- Die aktuellen Backend-Logs von `x-oauth-callback` zeigen den echten Fehler: X lehnt die App bei `GET https://api.x.com/2/users/me` mit `Client Forbidden`, `reason: client-not-enrolled`, `required_enrollment: Appropriate Level of API Access` ab.
- In `social_connections` existiert aktuell keine Zeile für `provider = 'x'`. X ist also derzeit nicht wirklich verbunden.

Warum du trotzdem keine Fehlermeldung siehst
- `supabase/functions/x-oauth-callback/index.ts` leitet bei Fehlern auf `/performance?provider=x&status=error&message=...` weiter.
- Die Fehlermeldung wird aber erst in `ConnectionsTab` / `XConnectionCard` ausgewertet.
- `src/pages/PerformanceTracker.tsx` öffnet standardmäßig immer den Tab `overview`, nicht `connections`.
- Dadurch landet man nach dem Redirect zwar auf `/performance`, aber nicht direkt in dem Bereich, der die X-Fehlermeldung sichtbar macht.
- Zusätzlich ist der Redirect hart an `APP_BASE_URL` gebunden. Wenn du den Flow aus Preview oder einer anderen URL startest, kann die Rückleitung auf einer anderen Domain/Ansicht landen als die, die du gerade beobachtest.

Fazit
- Ja: Die X-Credentials sind technisch hinterlegt.
- Nein: X ist nicht korrekt verbunden.
- Der aktuelle Blocker ist nicht „API-Key fehlt“, sondern: Die hinterlegte X-App wird von X selbst für v2 abgelehnt (Projektbindung/API-Level passt nicht).
- Der sichtbare UX-Bug ist: Die App zeigt den Fehler nicht zuverlässig, weil sie nach dem Callback auf der falschen Ansicht landet.

Implementierungsplan
1. `supabase/functions/x-oauth-callback/index.ts` anpassen
   - Bei Erfolg und Fehler auf `/performance?tab=connections...` weiterleiten.
   - `provider`, `status` und `message` beibehalten.
   - Optional einen Rücksprungpfad/origin mitgeben, damit Preview und Live-Domain sauber unterstützt werden.

2. `src/pages/PerformanceTracker.tsx` URL-gesteuert machen
   - `tab` aus der URL lesen.
   - Bei `tab=connections` direkt den Connections-Tab öffnen.
   - Standardverhalten für normale Aufrufe beibehalten.

3. `src/components/performance/ConnectionsTab.tsx` robuster machen
   - Erfolg nur anzeigen, wenn nach dem Redirect wirklich eine frische `social_connections`-Zeile für `x` gefunden wird.
   - `status=error` sofort als sichtbaren Fehler behandeln.
   - Query-Parameter erst entfernen, nachdem Toast/Banner sicher angezeigt wurden.

4. `src/components/performance/XConnectionCard.tsx` Diagnose weiter schärfen
   - Die vorhandene Inline-Fehlermeldung beibehalten.
   - Für `client-not-enrolled` einen klaren Hinweis anzeigen: X-App/Projekt/API-Zugang wird von X abgelehnt.

5. Nach Umsetzung validieren
   - Fehlerfall: Redirect landet direkt im Connections-Tab und zeigt die echte X-Meldung.
   - Erfolgsfall: X wird erst dann als verbunden angezeigt, wenn wirklich ein `social_connections`-Datensatz existiert.

Technische Details
- Keine Datenbankmigration nötig.
- Aktueller nachweisbarer Root Cause im Backend: `client-not-enrolled`.
- Aktueller nachweisbarer Root Cause im Frontend: Redirect landet nicht direkt in der Ansicht, die den Fehler ausliest und anzeigt.
