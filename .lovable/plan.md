

## Instagram-Connect direkt auf das funktionierende Facebook-Muster bringen

### Deine Frage, kurz beantwortet
Ja — für dein Video ist es **deutlich sinnvoller**, Instagram **exakt auf die bereits funktionierende Facebook-Pipeline** zu legen, statt parallel an einem neuen Hard-Reset/Edit-Settings-Pfad zu basteln.

Bei Facebook siehst du:
- Klick auf **Connect Facebook**
- sauberer Meta-Login/Continue
- Rückkehr in die App
- **Page-Select-Dialog**
- fertige Verbindung

Genau dieses Verhalten holen wir 1:1 für Instagram.

### Was geändert wird

#### 1. Instagram nutzt denselben Start-Mechanismus wie Facebook
**Datei:** `src/components/performance/ConnectionsTab.tsx`

- `handleConnect('instagram')` ruft **nicht mehr** `instagram-oauth-start` + `instagram-oauth-revoke` auf.
- Stattdessen wird der **gleiche Frontend-OAuth-Builder** wie für Facebook verwendet (gleiche `client_id`, gleiche `redirect_uri`, gleicher `state`-Mechanismus, identischer Authorize-Call).
- Einziger Unterschied: das `provider`-Feld im `state` ist `instagram` und die Scopes enthalten zusätzlich:
  - `instagram_basic`
  - `instagram_content_publish`
- Kein automatischer Hard-Reset, kein `auth_type=rerequest`, kein extra `auth_nonce`. Genau wie Facebook.

#### 2. Callback exakt wie Facebook behandeln
**Datei:** `supabase/functions/oauth-callback/index.ts`

- Für `provider=instagram` wird derselbe Pfad wie für `provider=facebook` durchlaufen:
  - Token-Exchange
  - Speichern als **pending** Verbindung mit `selection_required: true`
  - Rückleitung in die App mit `connected=instagram&status=success`
- Keine automatische `/me/accounts`-Auflösung mehr im Callback.

#### 3. Page-Select-Dialog wie bei Facebook öffnen
**Datei:** `src/components/performance/ConnectionsTab.tsx` + `FacebookPageSelectDialog.tsx`

- Nach Rückkehr aus dem OAuth-Flow erkennt die UI `connected=instagram` + `selection_required=true` und öffnet **denselben Dialog** wie für Facebook (Modus `instagram`).
- Nutzer wählt eine Facebook-Seite mit verknüpftem Instagram-Business-Konto.
- `facebook-select-page` finalisiert die Instagram-Verbindung (bereits vorhanden).

#### 4. Hard-Reset/Revoke wird vom Connect-Flow entkoppelt
- `instagram-oauth-revoke` bleibt als **manueller Disconnect-Pfad** erhalten.
- Wird aber **nicht mehr automatisch** beim Connect ausgelöst.
- `instagram-oauth-start` wird vom Connect-Flow **nicht mehr aufgerufen** (Funktion bleibt für eventuelle spätere Verwendung bestehen).

### Erwartetes Ergebnis im Video
```text
Klick auf Connect Instagram
→ Meta-Login/Continue (genau wie bei Facebook)
→ Rückkehr in die App
→ Page-Select-Dialog erscheint
→ Seite mit verknüpftem Instagram-Business wählen
→ Instagram-Verbindung steht
```

Visuell **nicht unterscheidbar** vom funktionierenden Facebook-Flow.

### Wichtiger Hinweis (Trade-off)
- Der „You previously logged into …"-Screen kann von Meta trotzdem angezeigt werden — aber **das passiert bei Facebook ja auch** und stört dort nicht.
- Solange die Verbindung danach sauber im Page-Select-Dialog endet, ist das für dein Video genau der gewünschte Ablauf.
- Den aggressiven Hard-Reset/Re-Consent-Pfad können wir **später** wieder aktivieren, wenn er für App Review nötig wird. Für **jetzt** zählt: gleicher sichtbarer Flow wie Facebook.

### Betroffene Dateien
- `src/components/performance/ConnectionsTab.tsx` — Instagram-Connect auf Facebook-Builder umstellen, Auto-Revoke entfernen
- `supabase/functions/oauth-callback/index.ts` — Instagram-Pfad identisch zu Facebook-Pfad halten (pending + selection_required)
- keine Änderungen an `FacebookPageSelectDialog.tsx`, `facebook-list-pages`, `facebook-select-page` (bereits vorbereitet)

### Risiko
Gering. Wir entfernen Komplexität und legen Instagram auf einen **bereits funktionierenden** Flow.

### Test nach Umsetzung
1. Instagram trennen
2. **Connect Instagram** klicken
3. Meta-Flow durchlaufen wie bei Facebook
4. zurück in der App: Page-Select-Dialog erscheint
5. Seite mit IG-Business wählen → Verbindung steht
6. Ablauf ist visuell identisch zu Facebook → bereit fürs Video

