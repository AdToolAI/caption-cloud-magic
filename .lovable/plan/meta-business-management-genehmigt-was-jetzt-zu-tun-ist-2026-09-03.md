# Meta business_management genehmigt — was jetzt zu tun ist

Gute Nachricht: **am Code muss inhaltlich nichts Neues gebaut werden.** Die Anpassungen aus dem 06.–08. August liegen bereits im Repository und sind auf genau diesen Fall vorbereitet.

## Was im Code bereits steht (geprüft)

- `facebook-oauth-start` und `instagram-oauth-start` fordern `business_management` bereits mit an (jeweils in der Scope-Liste, mit Kommentar „Required when the Page lives inside a Business portfolio").
- Die Seiten-Erkennung (`_shared/meta-page-discovery.ts`) liest Seiten aus **drei** Quellen und vereinigt sie:
  1. `/me/accounts`
  2. `granular_scopes[].target_ids` aus `debug_token`
  3. `/me/businesses` → `owned_pages` + `client_pages` (genau der Pfad, der `business_management` braucht)
- Seiten ohne Page-Access-Token werden nicht mehr stillschweigend verworfen.

Bis zur Genehmigung lief Punkt 3 ins Leere, weil Meta die Berechtigung nicht erteilt hat. Mit der Genehmigung greift dieser Zweig ab sofort.

## Zu erledigen

1. **Edge Functions neu deployen** (falls seit den August-Änderungen nicht geschehen):
   `facebook-oauth-start`, `instagram-oauth-start`, `oauth-callback`, `facebook-list-pages`, `facebook-select-page`, `meta-page-probe`, `meta-oauth-diff`.
2. **Bestehende Verbindungen neu verbinden.** Alte Tokens enthalten `business_management` nicht — die Berechtigung gilt erst für neu ausgestellte Tokens. Also im Verbindungsbereich einmal trennen und neu verbinden (Facebook und Instagram).
3. **Verifizieren** über die vorhandene Diagnose (`meta-page-probe` im Verbindungs-Panel): `granted_scopes` muss `business_management` enthalten, `/me/businesses` darf keinen Fehlercode mehr liefern, und die Seite „AdTool AI" muss in der Auswahl erscheinen.
4. **Nur falls Schritt 3 noch leer bleibt:** dann liegt es nicht mehr an der Berechtigung, sondern an der Asset-Zuordnung im Business-Portfolio. Der nächste Schritt wäre dann die Auswertung der Roh-Antworten aus der Probe — kein Blind-Fix.

## Technische Details

- Keine Änderung an Scope-Listen nötig; `META_LOGIN_CONFIG_ID` bleibt ungesetzt, damit der klassische Dialog mit Inline-Scopes verwendet wird (dieser transportiert `business_management` korrekt).
- Keine Migration, keine Frontend-Änderung.
- Optional als kleine Ergänzung: im Verbindungs-Panel einen Hinweis „Neu verbinden nötig", wenn eine gespeicherte Verbindung `business_management` nicht in `granted_scopes` hat — DE/EN/ES in `src/lib/translations.ts`.
