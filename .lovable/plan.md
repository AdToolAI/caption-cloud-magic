

# Plan: Social-Media-Icons zur Integrationsseite verlinken

## Problem
Die Social-Connection-Icons im Dashboard navigieren zu `/social-media-settings?connect=...`, aber diese Route existiert nicht. Die korrekte Route ist `/integrations`.

## Änderung

### `src/components/dashboard/SocialConnectionIcons.tsx` — Route ändern (Zeile 30)
```tsx
// Von:
onClick={() => navigate(`/social-media-settings?connect=${id}`)}
// Zu:
onClick={() => navigate(`/integrations?connect=${id}`)}
```

Eine Zeile, fertig.

