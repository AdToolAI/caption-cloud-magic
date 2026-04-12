

## Plan: Create Enterprise Account with AI Video Credits

### Steps

1. **Create user account** via edge function or admin API call
   - Email: ceybota@gmail.com
   - Password: Houston$123
   - `email_confirm: true` (skip verification)

2. **Update profile to Enterprise**
   - Set `plan: 'enterprise'` in `profiles` table

3. **Update wallet to Enterprise**
   - Set `plan_code: 'enterprise'`, `monthly_credits: 999999999`, `balance: 999999999` in `wallets` table

4. **Create AI Video wallet with $50 balance**
   - Insert into `ai_video_wallets`: `balance_euros: 50`, `total_purchased_euros: 50`, `currency: 'USD'`

All triggered data (profile, wallet, workspace) will be auto-created by existing database triggers. Steps 2-4 will update/insert the generated records.

