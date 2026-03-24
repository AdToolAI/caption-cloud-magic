

## Notification-Glocke: Sidebar entfernen, Header wiederherstellen

### Aenderungen

**1. `src/components/layout/AppHeader.tsx`** — NotificationBell zurueck in den Header:
- Import `NotificationBell` aus `@/components/NotificationBell` hinzufuegen
- Zwischen ThemeToggle und UserMenu einfuegen: `{user && <NotificationBell />}`

**2. `src/components/AppSidebar.tsx`** — Glocke aus der Sidebar entfernen:
- Den `NotificationBadge`-Block (Zeilen 47-49) und den zugehoerigen Import entfernen
- Den `NotificationCenter`-Block und Import entfernen
- Den `useState` fuer `showNotifications` entfernen

