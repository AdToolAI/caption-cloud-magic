# Meta-OAuth wirklich zurücksetzen für das Review-Video

## Gesicherter Befund

Der Screenshot ist die Folge eines fehlgeschlagenen Widerrufs, nicht des falschen Facebook-Profils.

Die Live-Logs von heute 11:45 und 11:49 Uhr zeigen:

```text
revoked: false
Meta 400 (#100): Unsupported delete request
authorizationCleared: false
remainingScopeCount: 5
```

Damit ist die alte App-Zustimmung bei Meta weiterhin aktiv. Deshalb erscheint „You previously logged into AdTool AI Integration“ und Meta überspringt den vollständigen Dialog mit `business_management` und Seitenauswahl.

## Umsetzung

1. **Token-Typ zuverlässig bestimmen**
   - Den gespeicherten Token vor dem Widerruf über Metas `debug_token` prüfen.
   - Nur einen bestätigten User-Token verwenden; Page-Tokens werden ausgeschlossen.
   - Den in `debug_token` ausgewiesenen User und die gespeicherte Meta-User-ID protokollieren, ohne Tokenwerte auszugeben.

2. **Widerruf auf den aktuellen Meta-Nutzer richten**
   - Statt des derzeit scheiternden `DELETE /{aufgelöste-id}/permissions` den Widerruf mit dem bestätigten User-Token über `DELETE /me/permissions` ausführen.
   - Meta-Antwort semantisch prüfen; HTTP 200 allein zählt nicht als erfolgreicher Reset.
   - Nur bei bestätigtem Erfolg die lokale Facebook-/Instagram-Verbindung entfernen.

3. **Reset danach unabhängig verifizieren**
   - Den ursprünglichen Token erneut mit `debug_token` prüfen.
   - Nur `is_valid=false` beziehungsweise keine verbleibenden Scopes gilt als „vollständig zurückgesetzt“.
   - Solange fünf oder andere Scopes verbleiben, zeigt die UI ausdrücklich „Noch nicht bereit für die Aufnahme“ und startet keinen irreführenden Connect.

4. **Aufnahme-sicherer Ablauf in der UI**
   - Der Button „Mit anderem Facebook-Konto verbinden“ wird nach einem Reset erst aktiv, wenn die Verifikation erfolgreich ist.
   - Bei Meta-Fehler `#100` erscheint statt einer allgemeinen Meldung der konkrete manuelle Weg: Im angemeldeten Admin-Profil `bestofproducts4u@gmail.com` unter Facebook **Einstellungen → Apps und Websites → AdTool AI Integration → Entfernen**.
   - Danach erneut prüfen und erst dann den Connect mit dem Admin-Profil starten.

## Technische Änderungen

- `supabase/functions/instagram-oauth-revoke/index.ts`: `debug_token`-Typprüfung, Widerruf über `/me/permissions`, strikte Erfolgs- und Nachprüfung.
- `src/components/performance/MetaOAuthResetPanel.tsx`: Connect-Gate, eindeutiger Aufnahme-Status und konkreter manueller Fallback.
- `src/lib/translations.ts`: Status- und Fehlertexte in DE, EN und ES.
- Keine Änderung an Scopes, Callback, Datenbankschema oder normalen Publishing-Funktionen.

## Abnahme

1. Reset mit dem Admin-Profil ausführen.
2. Status muss `authorization_cleared=true` und null verbleibende Scopes zeigen.
3. Neuer Connect darf nicht mehr „You previously logged in“ anzeigen.
4. Im vollständigen Meta-Dialog müssen `business_management` und die beiden Seiten **Mystische aber wahre Geschichten** sowie **Bestofproducts4u** auswählbar sein.
5. Erst danach das 60–90-Sekunden-Review-Video aufnehmen.