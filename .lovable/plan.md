## Ziel
Konto `info@useadtool.ai` zurücksetzen, damit du den kompletten Signup- und Email-Verifizierungs-Flow erneut testen kannst.

## Status in der DB
- User existiert: `c697c171-2f68-45b4-9f16-85e056c9c154`
- `email_confirmed_at`: `NULL` (Email war nie bestätigt)
- Erstellt: 25.05.2026

## Vorgehen
Da das Konto ohnehin nie verifiziert wurde, ist der sauberste Reset das vollständige Löschen des Users. Danach kannst du dich mit derselben Email frisch registrieren und bekommst eine neue Verifizierungs-Mail.

1. **Lösche** den Auth-User `info@useadtool.ai` aus `auth.users`.
   - Alle abhängigen Daten (profiles, user_roles, wallet etc.) werden über `ON DELETE CASCADE` automatisch mit entfernt.
2. **Kontrolle**: Re-Query auf `auth.users` um sicherzustellen, dass die Zeile weg ist.
3. Du kannst dich danach unter `/auth` neu registrieren — der `auth-email-hook` schickt dann die neue AdTool-AI-gebrandete Verifizierungs-Mail über `notify.useadtool.ai`.

## Hinweis
Alternative wäre, nur `email_confirmed_at` zurückzusetzen — das würde aber keine neue Mail auslösen und du müsstest "Mail erneut senden" anstoßen. Komplettes Löschen ist für deinen Test-Use-Case eindeutiger.

Bestätige die Implementierung und ich führe das Löschen aus.