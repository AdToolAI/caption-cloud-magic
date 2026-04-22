
## Instagram OAuth: vollen Review-Flow wirklich erzwingen

### Wahrscheinliche Hauptursache
Der entscheidende Bug sitzt aktuell im Disconnect/Revoke-Flow:

- `supabase/functions/instagram-oauth-revoke/index.ts` liest `access_token`
- im Projekt werden Tokens aber überall als `access_token_hash` gespeichert

Dadurch wird bei „Disconnect Instagram“ sehr wahrscheinlich **nur die DB-Verbindung gelöscht**, aber Meta bekommt **keinen echten Permission-Revoke**. Ergebnis: Beim nächsten Connect erkennt Meta die App weiter als bereits autorisiert und zeigt wieder nur die verkürzte „You previously logged into…”-Seite.

Zusätzlich ist `auth_type=rerequest` nicht ideal für diesen Fall:
- `rerequest` ist für erneut angefragte/abgelehnte Berechtigungen
- für einen wirklich frischen Login-/Identitäts-Schritt ist `reauthenticate` passender

### Was ich ändern werde

#### 1. Revoke-Funktion wirklich funktionsfähig machen
**Datei:** `supabase/functions/instagram-oauth-revoke/index.ts`

Änderungen:
- `access_token` → `access_token_hash`
- den gespeicherten Token korrekt mit `decryptToken(connection.access_token_hash)` entschlüsseln
- optional vor/nach dem Revoke sauber loggen:
  - ob `/me` aufgelöst werden konnte
  - ob `DELETE /{user-id}/permissions` erfolgreich war
- Response präzisieren, damit das Frontend klar weiß:
  - `revoked: true/false`
  - `revokeError`
  - `connectionDeleted`

Ziel:
Der Disconnect muss Meta die Berechtigungen **wirklich entziehen**, nicht nur lokal die Verbindung löschen.

#### 2. Instagram-Start auf echten Re-Auth umstellen
**Datei:** `supabase/functions/instagram-oauth-start/index.ts`

Änderungen:
- `auth_type=rerequest` ersetzen durch `auth_type=reauthenticate`
- zusätzlich einen frischen `auth_nonce` mitsenden
- `display=page` beibehalten

Beispielrichtung:
```ts
authUrl.searchParams.set('auth_type', 'reauthenticate');
authUrl.searchParams.set('auth_nonce', crypto.randomUUID().replace(/-/g, ''));
authUrl.searchParams.set('display', 'page');
```

Ziel:
Meta soll den Flow weniger aggressiv abkürzen und nicht direkt in den bereits-cached Kurzdialog springen.

#### 3. Beide Disconnect-Einstiege vereinheitlichen
**Dateien:**
- `src/components/performance/ConnectionsTab.tsx`
- `src/components/account/LinkedAccountsCard.tsx`

Aktueller Stand:
- `ConnectionsTab` nutzt bereits `instagram-oauth-revoke`
- `LinkedAccountsCard` löscht weiterhin direkt die `social_connections`-Row

Änderung:
- auch in `LinkedAccountsCard` für Instagram immer dieselbe Revoke-Function verwenden
- damit der Bug nicht je nach Einstiegsort wieder auftritt

#### 4. Frontend-Feedback für Review-Fälle verbessern
**Dateien:**
- `src/components/performance/ConnectionsTab.tsx`
- ggf. `src/components/account/LinkedAccountsCard.tsx`

Änderungen:
- wenn Meta-Revoke fehlschlägt, klare Meldung statt stillem Fallback
- bei erfolgreichem Disconnect optional Hinweis:
  - „Meta permissions revoked successfully. Next connect should show full review flow.”

So sieht man direkt, ob der nächste Connect wirklich ein sauberer Test ist.

### Erwartetes Verhalten nach dem Fix

#### Disconnect
1. Instagram trennen
2. Edge Function widerruft Meta-Permissions tatsächlich
3. lokale Verbindung wird gelöscht

#### Reconnect
1. „Connect Instagram“
2. Meta erzwingt wieder den Re-Auth-/Consent-Schritt
3. danach erscheint der eigentliche Berechtigungs-Dialog deutlich zuverlässiger
4. nach Zustimmung wird die Verbindung gespeichert und in der UI angezeigt

### Wichtige Erwartungssteuerung
Meta kontrolliert die externen Seiten selbst. Es kann sein, dass **vor** der eigentlichen Berechtigungsseite weiterhin ein kurzer Identitäts-/Bestätigungs-Schritt erscheint. Entscheidend ist:
- nach echtem Revoke
- plus `reauthenticate`
- darf der Flow **nicht mehr direkt still zurückspringen**, sondern muss wieder in die vollständige Genehmigungsstrecke gehen

Wenn Meta weiterhin eine Vorstufe zeigt, ist das Meta-UI — aber der vollständige Permission-Teil muss danach wieder erscheinen.

### Technische Details
- Keine Datenbankmigration nötig
- Betroffene Dateien:
  - `supabase/functions/instagram-oauth-revoke/index.ts`
  - `supabase/functions/instagram-oauth-start/index.ts`
  - `src/components/account/LinkedAccountsCard.tsx`
  - optional kleine Anpassung in `src/components/performance/ConnectionsTab.tsx`
- Risiko: gering
- Wahrscheinlichster Fix-Hebel: der falsche Token-Feldname in der Revoke-Function

### Testablauf nach Umsetzung
1. Instagram disconnecten
2. prüfen, dass der Revoke erfolgreich gemeldet wird
3. erneut verbinden
4. bestätigen, dass der Flow nicht mehr nur lokal „weiterwinkt“, sondern wieder durch den vollständigen Meta-Genehmigungsweg läuft
5. anschließend kontrollieren, dass die Verbindung wieder korrekt in der Integrationsansicht erscheint
