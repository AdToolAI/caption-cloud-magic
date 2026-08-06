# Diagnose zeigt zu wenig — Meta-Block fehlt komplett

## Was dein Screenshot sagt

Für alle sechs Kanäle steht: Zugangsdaten grün, Verbindung/Posten gelb mit „Nicht verbunden". Das ist der erwartete Zustand ohne bestehende Verbindung — es sagt nichts über das Facebook-Problem aus.

Entscheidend ist, was **fehlt**: Der Abschnitt „Meta App-Grunddaten" und die Zeile „Redirect-URI (Soll-Wert)" werden im Panel gar nicht angezeigt. Beide erscheinen nur, wenn `oauth-config-check` Daten liefert. Sie fehlen also, weil dieser Aufruf entweder abgelehnt wurde, fehlschlug oder die Meta-Abfrage leer zurückkam.

Der Grund bleibt unsichtbar: Im Panel wird der Fehler des Aufrufs stillschweigend verschluckt (leeres Ergebnis statt Fehlermeldung). Deshalb hilft der Screenshot momentan nicht weiter — genau das ändere ich.

## Was ich umsetze

**1. Fehler sichtbar machen statt verschlucken**
Der `oauth-config-check`-Aufruf im Diagnose-Panel meldet künftig im Klartext, warum kein Ergebnis kam: keine Sitzung, HTTP-Status samt Antworttext der Funktion, oder „Meta-Abfrage ohne Ergebnis". Angezeigt als eigene Statuszeile oben im Panel.

**2. Meta-Abschnitt immer anzeigen**
Der Block „Meta App-Grunddaten" erscheint künftig auch dann, wenn keine Daten kamen — mit dem konkreten Grund (z. B. „App-Token abgelehnt", „App-ID fehlt", „Graph-API-Fehler <Code>: <Meldung>"), statt einfach zu verschwinden.

**3. Redirect-URI immer sichtbar**
Die Soll-Callback-URL wird künftig fest im Panel angezeigt (mit Kopier-Button), unabhängig davon, ob die Serverabfrage klappt. Sie ist ein bekannter, konstanter Wert und der häufigste Meta-Stolperstein.

**4. Grund der Graph-Abfrage mitliefern**
`oauth-config-check` gibt bei fehlgeschlagener Meta-Abfrage künftig `meta_app_status.error` mit Graph-Fehlercode und -Text zurück, statt `null`. Damit steht im Panel, ob App-ID/App-Secret fehlen, das App-Token ungültig ist oder Meta ein Pflichtfeld blockiert.

## Technische Details

- `src/components/performance/ConnectionDiagnostics.tsx`: `catch`-Zweige um den Config-Aufruf ersetzen den stillen Fallback durch einen erfassten Fehlertext (`FunctionsHttpError` → `error.context.text()`); neuer State `configError`; Meta- und Redirect-Abschnitte werden nicht mehr an `metaApp !== null` gekoppelt.
- `supabase/functions/oauth-config-check/index.ts`: Graph-Call-Fehler in `meta_app_status.error` (`code`, `message`, `http_status`) durchreichen; `backend_callback` immer setzen.
- `src/lib/translations.ts`: neue Texte DE/EN/ES für Fehlerzeile und Meta-Fehlerzustände.
- Keine Änderung an der OAuth-Logik selbst.
