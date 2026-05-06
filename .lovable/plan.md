## Problem
Klick auf "Repair images" → Toast "Edge Function returned a non-2xx status code".
Edge-Function-Logs zeigen: `[repair-brand-character-urls] error: Unauthorized`.

Ursache: In `supabase/functions/repair-brand-character-urls/index.ts` wird der User über
```ts
const supabaseUser = createClient(URL, ANON, { global: { headers: { Authorization: authHeader } } });
await supabaseUser.auth.getUser();
```
geholt. Bei aktivem JWT-Verify-Default kommt das Token aber gar nicht in der Funktion an, bzw. `getUser()` ohne explizites Token schlägt fehl. Außerdem fehlt für diese Function ein expliziter `verify_jwt`-Eintrag in `supabase/config.toml`, der das Verhalten deterministisch macht.

## Fix in 2 kleinen Schritten

### 1. `supabase/config.toml`
Funktions-Block hinzufügen, damit das JWT garantiert an die Function durchgereicht wird:
```
[functions.repair-brand-character-urls]
verify_jwt = false
```

### 2. `supabase/functions/repair-brand-character-urls/index.ts`
Auth robust machen — Token explizit aus dem Authorization-Header extrahieren und `getUser(token)` aufrufen, statt sich auf den Header-Fallback zu verlassen:
```ts
const token = authHeader.replace(/^Bearer\s+/i, '');
const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
if (error || !user) throw new Error('Unauthorized');
```
Der bestehende Service-Role-Client (`supabaseAdmin`) wird sowieso schon für Storage/DB benutzt — der separate User-Client kann entfallen.

Danach Re-Deploy + Test des "Repair images"-Buttons. Erwartung: 200er Response mit `{ repaired: 1, total: 1 }` und Matthews Bild lädt wieder.
