

## Plan: User `dusatkojr@web.de` erneut registrieren ermöglichen

### Aktuelle Situation in der Datenbank
- **User existiert** in `auth.users` (ID `45dc5d43-…b8f6`), erstellt am 19.04.2026
- **`email_confirmed_at` ist NULL** → Verifizierung wurde nie abgeschlossen
- **Verifizierungstoken existiert**, läuft am 20.04.2026 22:15 UTC ab
- **Kein Login** je erfolgt (`last_sign_in_at = NULL`)
- **Keine Edge-Function-Logs** für diesen User → die Verifizierungs-Mail kam vermutlich nie an (Resend-Domain noch nicht voll verifiziert ODER Spam-Ordner)

### Empfohlene Vorgehensweise: 2 Optionen

#### Option A (empfohlen): Account komplett löschen → User kann frisch registrieren
Sauberster Weg, da der User dann auch den Welcome-Bonus regulär bekommt und der gesamte Flow neu durchlaufen wird.

**Aktionen:**
1. `DELETE FROM public.email_verification_tokens WHERE user_id = '45dc5d43-…'`
2. `DELETE FROM public.profiles WHERE id = '45dc5d43-…'` (falls Cascade nicht greift)
3. `DELETE FROM public.wallets WHERE user_id = '45dc5d43-…'` (Trial-Wallet wurde via Trigger angelegt)
4. Auth-User löschen via Edge Function mit Service-Role (`supabase.auth.admin.deleteUser('45dc5d43-…')`) — entweder über eine bestehende Admin-Function oder eine kurze Einmal-Aktion

→ Danach kann sich der User unter `dusatkojr@web.de` komplett neu registrieren.

#### Option B: Account behalten, nur neuen Verifizierungslink senden
Schneller, aber: User muss auf der bestehenden Auth-Seite einloggen, landet im `EmailVerificationGate` und kann dort „Mail erneut senden" klicken.

**Aktionen:**
1. Token-Zeile auf `created_at = now() - 2 minutes` setzen, damit der 60s-Backend-Cooldown nicht greift
2. User wird gebeten, auf `/auth` einzuloggen → automatisch zu `/auth/check-email` weitergeleitet → „Resend"-Button drücken

### Zusätzlich dringend zu prüfen (gemeinsame Ursache)

**Verdacht:** Mails von Resend kommen nicht an, weil:
1. Die Domain `useadtool.ai` ist möglicherweise im Resend-Dashboard **noch nicht voll verifiziert** (SPF, DKIM, DMARC)
2. Oder die Mail liegt im **Spam-Ordner** des Users (`@web.de` ist als Provider strikt)

→ Vor jedem weiteren Test: kurz im Resend-Dashboard checken, ob `useadtool.ai` als „Verified" markiert ist und alle 3 DNS-Records grün sind.

### Empfehlung
**Option A** umsetzen — sauberer Reset, User kann komplett neu starten und der gesamte Flow (Signup → Mail → Verify → Welcome-Bonus → `/auth/check-email`) wird end-to-end frisch durchlaufen, was gleichzeitig auch ein guter Test ist.

### Was Lovable nach Plan-Approval tun wird
1. Eine kurze SQL-Migration ausführen, die alle Datenbank-Spuren des Users entfernt (Tokens, Profile, Wallet)
2. Eine kleine Einmal-Edge-Function (oder direkten Admin-API-Call) starten, der `auth.users`-Eintrag löscht
3. Bestätigung in den Chat: „User gelöscht — bitte jetzt unter `dusatkojr@web.de` neu registrieren"
4. Resend-Domain-Status kurz erinnern, falls die neue Mail wieder nicht ankommt

