# Trennen-Meldung bei Meta-Verbindungen: Befund und Korrektur

## Befund (aus dem Code gelesen)

Die rote Meldung ist kein Datenverlust: Die Verbindung wird lokal korrekt gelöscht. Fehlgeschlagen ist nur der zusätzliche Schritt "App-Freigabe bei Meta zurückziehen".

Zwei belegte Ursachen:

1. **Falscher Token für den Widerruf.** `instagram-oauth-revoke` läuft über alle Meta-Zeilen und ruft je Token `GET /me` auf, um die Meta-User-ID zu bestimmen. Für Instagram wird laut `oauth-callback` ein **Page Access Token** gespeichert (`page_access_token_encrypted` / Page-Token-Pfad), für Facebook dagegen der User-Token. Mit einem Page-Token liefert `/me` die **Seiten-ID**, und `DELETE /{page-id}/permissions` beantwortet Meta genau mit der gezeigten Fehlermeldung: `Unsupported delete request … GraphMethodException code 100`.
2. **Rohe Fehleranzeige.** Der Toast hängt die komplette Graph-API-JSON an und nutzt den Schlüssel `common.warning`, den es im obersten `common`-Block der Übersetzungen **nicht** gibt — deshalb steht dort wörtlich „common.warning".

## Umsetzung

1. **Widerruf mit dem richtigen Token**
   - Reihenfolge fixieren: zuerst die `facebook`-Zeile (User-Token), erst danach andere Meta-Zeilen.
   - Vor dem Widerruf prüfen, ob `/me` eine **User**-ID liefert (`GET /me?fields=id` plus `/debug_token`-Typprüfung bzw. Abgleich mit `account_metadata.meta_user_id`). Ist die aufgelöste ID eine Seiten-ID, den Token überspringen statt den Widerruf zu versuchen.
   - Wenn `account_metadata.meta_user_id` vorhanden ist, diese als Ziel-ID verwenden.
   - Kein `GraphMethodException` mehr als „Fehler“ melden, wenn danach ein gültiger User-Token erfolgreich widerruft.

2. **Verständliche Meldung statt Roh-JSON**
   - Graph-Fehler auf eine kurze, lesbare Zeile normalisieren (Code + Kurztext), Volltext nur ins Log.
   - Ton anpassen: Die Trennung war erfolgreich; der Hinweis betrifft nur die bei Meta verbliebene App-Freigabe, mit dem konkreten nächsten Schritt (Facebook → Einstellungen → Apps und Websites → AdTool AI entfernen).
   - Variante von `destructive` auf neutralen Hinweis ändern, da die Trennung selbst geklappt hat.

3. **Fehlender Übersetzungsschlüssel**
   - `common.warning` in DE/EN/ES ergänzen und die neuen Hinweistexte dort hinterlegen, statt sie hart im Code zu schreiben.

## Technische Details

- `supabase/functions/instagram-oauth-revoke/index.ts`: Token-Priorisierung, ID-Validierung, saubere `revokeError`-Kurzform.
- `src/components/performance/ConnectionsTab.tsx` und `src/components/account/LinkedAccountsCard.tsx`: übersetzte, gekürzte Meldung; kein Roh-JSON.
- `src/lib/translations.ts`: `common.warning` plus Meldungstexte in DE/EN/ES.
- Keine Änderung an Scopes, OAuth-Start, Callback-Zuordnung oder Datenbankschema.

## Abnahme

- Trennen der alten Verbindung (2 Seiten) meldet Erfolg und der nächste Connect zeigt wieder den vollen Berechtigungsdialog.
- Schlägt der Widerruf bei Meta doch fehl, erscheint ein kurzer, übersetzter Hinweis mit Handlungsanweisung — ohne Graph-JSON und ohne den Text „common.warning“.
