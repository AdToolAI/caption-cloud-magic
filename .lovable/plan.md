

## Plan: Benachrichtigungen-Tab zur Account-Seite hinzufügen

### Problem
Die Push-Benachrichtigungs-Einstellungen existieren als Komponente (`src/components/account/NotificationSettings.tsx`), aber es gibt keinen Tab auf der Account-Seite, um sie zu erreichen.

### Änderung

**Datei: `src/pages/Account.tsx`**
- Neuen Tab "Benachrichtigungen" (mit Bell-Icon) zu den 6 bestehenden Tabs hinzufügen (wird zu 7 Tabs → `grid-cols-7`)
- Neuen `TabsContent` mit der bestehenden `NotificationSettings`-Komponente einfügen
- Import von `NotificationSettings` und `Bell` Icon hinzufügen

### Ergebnis
Unter Konto-Einstellungen erscheint ein neuer Tab "Benachrichtigungen" zwischen "Datenschutz" und "Abo", wo man Push-Notifications und andere Benachrichtigungs-Einstellungen verwalten kann.

