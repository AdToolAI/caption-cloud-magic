

## Plan: Superuser "g.schiemann@gscinternational.de" erstellen

### Was gemacht wird

Ein Script wird ausgeführt, das über die Supabase Admin API einen neuen Benutzer erstellt und alle nötigen Tabellen befüllt:

### Schritte

**1. User in Auth erstellen**
- Email: `g.schiemann@gscinternational.de`
- Passwort: `gscinternational123`
- Email auto-bestätigt

**2. Profil setzen**
- Plan: `enterprise`
- Email verified: `true`

**3. Wallet auf Enterprise setzen**
- `plan_code`: `enterprise`
- `monthly_credits`: `999999999`
- `balance`: `999999999`

**4. Admin-Rolle zuweisen**
- Eintrag in `user_roles` mit Rolle `admin`

**5. AI Video Wallet mit 50€ aufladen**
- Eintrag in `ai_video_wallets` mit `balance_euros`: `50.00`

### Umsetzung
Ein einmaliges Script über die Edge Function Admin API (oder direkt via `supabase.auth.admin.createUser`) — alles in einem Durchlauf.

