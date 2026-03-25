

## Social-Connection-Icons in den AppHeader verschieben

### Aenderung

**`src/components/layout/AppHeader.tsx`** — `SocialConnectionIcons` importieren und im rechten Bereich einfuegen, zwischen Community-Button und NotificationBell (nur wenn `user` eingeloggt ist).

```text
Right Actions Reihenfolge:
  ThemeToggle | SocialConnectionIcons | Community | NotificationBell | UserMenu
```

Die `SocialConnectionIcons`-Komponente existiert bereits und ist kompakt genug fuer den Header. Auf Mobile (`hidden md:flex`) ausblenden, damit der Header nicht ueberlaeuft.

