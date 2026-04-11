

## Plan: UserMenu und Hub-Navigation umstrukturieren

### 4 Änderungen

**1. Brand Kit → Team-Hub verschieben**
- In `hubConfig.ts`: Neuen Eintrag `{ route: "/brand-kit", titleKey: "nav.brandKit", descKey: "hubItemDesc.brandKit", icon: Palette }` zum Team-Hub hinzufügen
- In `UserMenu.tsx`: Brand Kit Menüpunkt entfernen

**2. Instagram Publishing → nur für Testaccount sichtbar**
- In `UserMenu.tsx`: Instagram Publishing Menüpunkt nur anzeigen wenn `user.email === 'bestofproducts4@gmail.com'`

**3. Integrations aus UserMenu entfernen**
- In `UserMenu.tsx`: Den Integrations-Link komplett entfernen (Zeile 77-82)
- Die "AUTOMATE"-Sektion wird damit auch entfernt (kein Inhalt mehr nötig ausser ggf. Instagram Publishing für Testaccount)

**4. Campaign Assistant → Optimieren-Hub verschieben**
- In `hubConfig.ts`: Neuen Eintrag `{ route: "/campaigns", titleKey: "nav.campaigns", descKey: "hubItemDesc.campaigns", icon: Workflow }` zum Optimieren-Hub hinzufügen
- In `UserMenu.tsx`: Campaign Assistant Menüpunkt entfernen

### Betroffene Dateien
- `src/config/hubConfig.ts` — Brand Kit zu Team, Campaigns zu Optimieren
- `src/components/layout/UserMenu.tsx` — Brand Kit, Integrations, Campaigns entfernen; Instagram Publishing nur für Testaccount

