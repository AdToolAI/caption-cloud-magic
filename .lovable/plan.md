## v129.5a — Forensik-Sheet Auth-Fix

### Symptom
"Bundle-Fehler: Edge Function returned a non-2xx status code" beim Klick auf **Bundle erzeugen**. Edge-Function-Logs zeigen nur `booted` — die Funktion crasht/wirft bevor irgendein `console.log` greift, oder gibt ein 4xx zurück das nie geloggt wird.

### Root Cause
Beide neuen Functions (`syncso-support-bundle`, `syncso-replay`) verwenden ein nicht-Standard Auth-Muster:

```ts
const userClient = createClient(URL, ANON_KEY, { global: { headers: { Authorization: authHeader }}});
const { data: claims } = await userClient.auth.getClaims(token);
// claims.claims.sub
```

Alle anderen Admin-Edge-Functions im Projekt (z. B. `posthog-analytics`) nutzen das bewährte Muster:

```ts
const { data: { user } } = await admin.auth.getUser(token);
// user.id
```

`auth.getClaims(jwt)` ist in der hier verwendeten supabase-js-Version entweder nicht vorhanden oder liefert eine andere Shape — das `if (claimsErr || !claims?.claims?.sub)` schlägt deshalb selbst beim echten Admin fehl und gibt `401 unauthorized` zurück. Im Frontend kommt das als generischer "non-2xx" Fehler an.

### Scope (genau das, nichts anderes)

**Nur Auth-Validierung austauschen — keine Logik-Änderung, kein Live-Pipeline-Touch, kein Schema-Change.**

1. `supabase/functions/syncso-support-bundle/index.ts`
   - `userClient`/`getClaims`-Block ersetzen durch `admin.auth.getUser(token)`.
   - `userId = user.id`. Rest unverändert.

2. `supabase/functions/syncso-replay/index.ts`
   - Gleicher Austausch.

3. `supabase/functions/syncso-replay-webhook/index.ts`
   - Unverändert (shared-secret, kein User-JWT).

### Verifikation
1. Im Composer auf eine echte fehlgeschlagene Szene (mit `dialog_shots.passes[0].provider_job_id`) → "Forensik" → "Bundle erzeugen".
2. Erwartung: `200 OK`, Bundle-JSON in `support-bundles`-Bucket, signed URL im UI.
3. Bei Szene ohne Passes (wie aktuell sichtbar `4f97790f…`, `lip_sync_status: pending`) bleibt der bestehende klare 404 `pass_not_found` erhalten — kein Bug, korrekte Fehlermeldung.

### Nicht enthalten (bewusst)
- Keine Änderung an `composer_scenes` / `dialog_shots` / Wallet / Watchdog.
- Keine Lockerung der Admin-Only-Regel.
- Kein Refactor des Bundle-Inhalts, keine neuen Presets, kein Auto-Replay.
- Kein neuer Eintrag in `mem/index.md` (zu kleiner Hotfix).
