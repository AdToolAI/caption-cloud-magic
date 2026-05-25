## Problem
Im "Erste Schritte"-Panel führt der Eintrag **Social-Konto verbinden** auf die Route `/hub/social-management`. Diesen Hub gibt es in `src/config/hubConfig.ts` nicht (mehr) → die `HubPage` rendert "Hub not found".

Die existierende Seite für Social-Verbindungen ist `/integrations` (in `App.tsx` registriert, wird auch von `SocialConnectionIcons` benutzt).

## Fix
**Datei:** `src/hooks/useGettingStartedProgress.ts`

Route für `social_connected` ändern:

```ts
{
  key: "social_connected",
  done: (socialRes.count ?? 0) > 0,
  route: "/integrations",   // statt "/hub/social-management"
},
```

Keine weiteren Änderungen nötig — Übersetzungen, Icons und Done-Detection (via `social_connections`) bleiben gleich.