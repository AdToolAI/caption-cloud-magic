

## Meta Reviewer Test-Account erstellen

### Was wird gebaut
Eine temporäre Edge Function `create-reviewer-account`, die einen Testaccount für den Meta App Reviewer erstellt und mit Enterprise-Plan ausstattet.

### Schritte

1. **Edge Function `create-reviewer-account` erstellen**
   - Erstellt einen User via `supabase.auth.admin.createUser()` mit festen Credentials:
     - E-Mail: `meta-reviewer@useadtool.ai`
     - Passwort: `MetaReview2026!Secure`
     - `email_confirm: true` (damit sofort eingeloggt werden kann)
   - Setzt Profil auf `plan: 'enterprise'`
   - Setzt Wallet auf `plan_code: 'enterprise'`, `monthly_credits: 999999999`, `balance: 999999999`
   - Erstellt `ai_video_wallets`-Eintrag mit 100€ Balance

2. **`upgrade-to-enterprise` allowedEmails erweitern**
   - `meta-reviewer@useadtool.ai` zur Liste hinzufügen (falls manueller Re-Upgrade nötig)

3. **Edge Function aufrufen** um den Account anzulegen

4. **Edge Function nach Erstellung wieder löschen** (temporär)

### Ergebnis
Der Reviewer kann sich mit den Credentials einloggen und hat vollen Zugriff auf alle Features (Enterprise-Plan, unbegrenzte Credits).

### Credentials für Meta App Review
```
Email: meta-reviewer@useadtool.ai
Password: MetaReview2026!Secure
```

