

# Plan: Testaccount erstellen für denkandreas@web.de

## Was wird gemacht

Eine temporäre Edge Function `create-test-account` erstellen, die:

1. **User in auth.users anlegt** via `supabase.auth.admin.createUser()` mit Email `denkandreas@web.de` und Passwort `denkandreas123`, Email sofort bestätigt
2. **Profil auf Enterprise setzt** — `profiles.plan = 'enterprise'` (Profil wird automatisch durch den `handle_new_user` Trigger erstellt)
3. **Wallet auf Enterprise setzt** — `wallets.plan_code = 'enterprise'`, `monthly_credits = 999999999`, `balance = 999999999` (Wallet wird automatisch durch den `create_wallet_for_new_user` Trigger erstellt)
4. **$50 AI Video Guthaben hinzufügt** — `ai_video_wallets` Eintrag mit `balance_euros = 50`, `currency = 'USD'`
5. **Email zur allowedEmails in upgrade-to-enterprise hinzufügt** (für zukünftige Nutzung)

## Ablauf

### Schritt 1: Edge Function erstellen + deployen
`supabase/functions/create-test-account/index.ts` — einmalige Funktion die den Account anlegt.

### Schritt 2: Funktion aufrufen
Via `curl_edge_functions` die Funktion ausführen.

### Schritt 3: Aufräumen
Edge Function nach erfolgreicher Ausführung wieder löschen (einmaliger Zweck).

### Schritt 4: upgrade-to-enterprise aktualisieren
`denkandreas@web.de` zur `allowedEmails` Liste hinzufügen.

## Betroffene Dateien

| Datei | Änderung |
|-------|----------|
| `supabase/functions/create-test-account/index.ts` | Temporäre Edge Function (wird nach Nutzung gelöscht) |
| `supabase/functions/upgrade-to-enterprise/index.ts` | Email zur allowedEmails hinzufügen |

