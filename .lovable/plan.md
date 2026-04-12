

## Plan: Localize Account Settings page (EN/DE/ES)

### Problem
The Account page header and a few sub-components have hardcoded German strings visible in the English UI. From the screenshot: "Konto-Einstellungen", "Geschützt", "Verifiziert".

### Files to edit (3 files)

| File | Hardcoded German strings |
|------|--------------------------|
| `src/lib/translations.ts` | Add ~10 `account.*` keys for header + timezone + security toasts |
| `src/components/account/AccountHeroHeader.tsx` | 3 — "Konto-Einstellungen", "Geschützt", "Verifiziert" |
| `src/components/account/SecurityTab.tsx` | 4 — toast messages: "2FA deaktiviert", "Zwei-Faktor-Authentifizierung wurde deaktiviert", "Fehler", "2FA konnte nicht deaktiviert werden" |
| `src/components/account/TimezoneSelect.tsx` | 4 — "Zeitzone", "Deine Zeitzone für Planungen...", "Zeitzone auswählen", "Zeitzone gespeichert", "Fehler beim Speichern" |

### Approach
1. Add missing translation keys to `translations.ts` (EN/DE/ES). DE = current hardcoded strings.
2. Add `useTranslation` hook to `AccountHeroHeader.tsx` and `TimezoneSelect.tsx`; use existing hook in `SecurityTab.tsx`.
3. Replace hardcoded strings with `t()` calls.
4. German UI unchanged.

### Technical details
- AccountHeroHeader: `t('account.header.title')`, `t('account.header.protected')`, `t('account.header.verified')`
- TimezoneSelect: `t('account.timezone.title')`, `t('account.timezone.subtitle')`, `t('account.timezone.select')`, `t('account.timezone.saved')`, `t('account.timezone.error')`
- SecurityTab: Replace hardcoded toast strings with `t('account.twoFactor.deactivated')`, `t('account.twoFactor.deactivatedDesc')`, `t('account.twoFactor.error')`, `t('account.twoFactor.errorDisabling')`

