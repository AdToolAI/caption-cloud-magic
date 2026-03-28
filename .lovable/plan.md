

## Account erstellen: rodger@dusatko.com (Enterprise + $100 AI Credits)

### Vorgehen

Ich erstelle eine **einmalige Edge Function** `create-rodger-account`, die:

1. **User anlegt** via `supabase.auth.admin.createUser()` mit:
   - E-Mail: `rodger@dusatko.com`
   - Passwort: `Wonderful01$`
   - `email_confirm: true` (sofort verifiziert)

2. **Profil auf Enterprise setzt** — `profiles.plan = 'enterprise'`

3. **Wallet auf Enterprise setzt** — `wallets.plan_code = 'enterprise'`, `monthly_credits = 999999999`, `balance = 999999999`

4. **AI Video Wallet mit $100 anlegt** — `ai_video_wallets.balance_euros = 100`

5. **`rodger@dusatko.com` zur Allowlist** in `upgrade-to-enterprise` hinzufügen (für zukünftige Upgrades)

### Ablauf
- Edge Function deployen → einmal aufrufen → Ergebnis prüfen → Function wieder löschen
- Genau wie bei den bestehenden Enterprise-Accounts (denkandreas@web.de etc.)

### Dateien
- **Neu (temporär):** `supabase/functions/create-rodger-account/index.ts`
- **Update:** `supabase/functions/upgrade-to-enterprise/index.ts` — E-Mail zur Allowlist

