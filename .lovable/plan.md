

## Plan: Test-User löschen

Ich lösche den User `dusatkojr@web.de` aus der Datenbank, damit du die Registrierung neu testen kannst.

### Was passiert
1. **User-ID finden** in `auth.users` über die E-Mail-Adresse
2. **Komplette Löschung** über Supabase Admin API (`auth.admin.deleteUser`)
   - Löscht den User aus `auth.users`
   - **Cascade-Delete** entfernt automatisch alle abhängigen Datensätze:
     - `profiles` (inkl. `welcome_bonus_granted_at`, `welcome_bonus_seen_at`)
     - `wallets` (Standard-Credits)
     - `ai_video_wallets` (falls vorhanden)
     - `workspaces` + `workspace_members` (eigener Default-Workspace)
     - `email_verification_tokens` (offene Verifizierungs-Tokens)
     - alle weiteren user-bezogenen Daten via `ON DELETE CASCADE`

### Umsetzung
- **Einmalige Edge Function** `admin-delete-test-user` (mit Service-Role-Key, sucht via E-Mail und löscht)
- Aufruf direkt nach Deployment
- Function wird nach erfolgreichem Löschen wieder entfernt (kein dauerhaftes Admin-Interface)

### Verifikation
Nach dem Löschen prüfe ich per SQL, dass:
- kein Eintrag mehr in `auth.users` für die E-Mail existiert
- kein verwaister `profiles`-Eintrag verbleibt
- kein offenes Token in `email_verification_tokens` liegt

Danach kannst du dich mit `dusatkojr@web.de` komplett neu registrieren — inkl. frischer E-Mail-Verifizierung und Welcome-Bonus.

