# Facebook-Verbindung: „Feature nicht verfügbar"

## Was die Meldung bedeutet

Der Aufruf ist technisch korrekt: Die URL enthält die richtige App-ID, die richtige Redirect-URI (Backend-Callback) und einen gültigen State. Der Abbruch kommt **nicht** aus unserem Code, sondern von Meta selbst.

„Du kannst dich aktuell nicht über Facebook bei dieser App anmelden, da wir zusätzliche Details für diese App aktualisieren" ist Metas Standardtext, wenn die App **nicht im Live-Modus** ist bzw. das Produkt „Facebook Login" / der Use Case noch nicht vollständig konfiguriert oder in Prüfung ist. In diesem Zustand kann sich niemand anmelden — auch nicht der App-Eigentümer, sofern er nicht als Administrator/Entwickler/Tester der App eingetragen ist.

Am Code lässt sich das nicht beheben.

## Was im Meta-Entwicklerkonto zu prüfen ist

1. App-Modus oben in der App-Leiste: steht er auf **Entwicklung**, kann nur eingetragenes App-Personal einloggen. `info@useadtool.ai` muss dann als Administrator oder Tester in der App-Rolle hinterlegt sein.
2. Produkt **Facebook Login für Unternehmen** (bzw. Facebook Login) muss hinzugefügt und konfiguriert sein — inklusive gültiger OAuth-Redirect-URI (der Supabase-Callback, exakt wie in der aufgerufenen URL).
3. App-Grunddaten vollständig: Datenschutzerklärung-URL, Nutzungsbedingungen, App-Symbol, Kategorie, Datenlöschungs-Hinweis. Fehlt eines davon, blockiert Meta den Login-Dialog mit genau dieser Meldung.
4. Business-Verifizierung: Für Veröffentlichungsrechte (`pages_manage_posts`, `instagram_content_publish`) verlangt Meta eine verifizierte Unternehmensseite plus App-Review.
5. Erst wenn 1–4 erfüllt sind, App auf **Live** schalten.

## Was ich auf unserer Seite ergänze

- **Diagnose-Panel erweitern**: Über die Graph-API (`/{app-id}?fields=...` mit App-Token) den tatsächlichen App-Status abfragen und im Verbindungsbereich anzeigen: „App im Entwicklungsmodus — nur Testnutzer können sich verbinden" statt eines stillen Fehlschlags.
- **Klare Fehlerseite**: Wenn Facebook den Nutzer ohne `code` zurückschickt oder der Dialog abbricht, im Verbindungsbereich eine verständliche Meldung mit Hinweis auf den App-Status zeigen, statt nur „Verbindung fehlgeschlagen".
- **Checkliste in der UI**: Kurzer Hinweistext im Facebook/Instagram-Bereich, welche Meta-seitigen Schritte für Live-Betrieb nötig sind (nur für Admin-Ansicht).

## Technische Details

- Betroffene Funktionen: `facebook-oauth-start`, `instagram-oauth-start`, `oauth-callback`, `oauth-config-check`.
- `oauth-config-check` bekommt einen zusätzlichen Abschnitt „App-Status" (Live/Entwicklung, fehlende Pflichtfelder), abgefragt mit `META_APP_ID` + `META_APP_SECRET` als App-Token.
- `ConnectionDiagnostics.tsx` rendert den neuen Status als eigene Zeile pro Meta-Kanal.
- Keine Änderung an der OAuth-Logik selbst — die ist korrekt.
