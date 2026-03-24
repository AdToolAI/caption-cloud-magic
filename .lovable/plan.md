

## Doppelte Notification-Glocke entfernen

### Problem
Es gibt zwei Notification-Glocken: eine in der Sidebar (links) und eine im AppHeader (rechts oben). Die rechte im Header soll entfernt werden.

### Aenderung

**`src/components/layout/AppHeader.tsx`** (Zeile 51):
- `{user && <NotificationBell />}` entfernen
- Den `NotificationBell` Import entfernen

Die Sidebar-Glocke bleibt bestehen als einziger Zugang zu Benachrichtigungen.

