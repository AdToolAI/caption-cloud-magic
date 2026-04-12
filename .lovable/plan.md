

## Plan: Fix Connect Navigation + Localize Integrations Page

### Two issues to fix

**Issue 1**: Clicking "Connect" in Account Settings > Connections just shows a toast instead of navigating to the Social Media Integrations page (`/integrations`).

**Issue 2**: The Integrations page and its ConnectionsTab have ~35 hardcoded German strings visible in the English UI.

### Files to edit (3 files)

| File | Changes |
|------|---------|
| `src/components/account/LinkedAccountsCard.tsx` | Change `handleConnect` to navigate to `/integrations` instead of showing a toast |
| `src/lib/translations.ts` | Add `integrations.*` keys (EN/DE/ES) for ~15 strings on the Integrations page |
| `src/pages/Integrations.tsx` | Add `useTranslation`, replace all hardcoded German strings with `t()` calls |
| `src/components/performance/ConnectionsTab.tsx` | Replace ~20 hardcoded German strings (toasts, labels, buttons) with `t()` calls and add corresponding keys |

### Hardcoded German strings to localize

**Integrations.tsx (~10)**:
- "Social-Media-Integrationen", subtitle text, "Sichere OAuth 2.0 Authentifizierung", "Automatische Synchronisation", "Dein aktueller Plan", "Keine Verbindungen", "Bis zu 3 Plattformen", "Unbegrenzte Verbindungen", "Jetzt upgraden →", Pro plan upgrade hint

**ConnectionsTab.tsx (~20)**:
- "Verbindung fehlgeschlagen", "Session konnte nicht erneuert werden", "Verbindung konnte nicht gespeichert werden", "Authentifizierung erforderlich", "Bitte melden Sie sich erneut an"
- "erfolgreich verbunden!", "erfolgreich synchronisiert", "Sync fehlgeschlagen"
- "Token abgelaufen", "Bitte trenne die Verbindung und verbinde…erneut"
- "Session abgelaufen. Bitte lade die Seite neu…", "Neu laden"
- "Token erneuern", "Seite auswählen", "Seite wechseln", "Seitenauswahl erforderlich"
- "Post-Sync eingeschränkt (API-Policy). UGC-Publishing verfügbar."
- "Sync Now", "Upload Draft (Optional)"

### Navigation fix detail
In `LinkedAccountsCard.tsx`, `handleConnect` will use `useNavigate()` to redirect to `/integrations` so the user lands on the full Social Media Integrations page where the real OAuth connect flow lives.

