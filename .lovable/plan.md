

## Header-Icons neu sortieren

### Aenderung in `src/components/layout/AppHeader.tsx`

Die 6 Social-Connection-Icons nach links verschieben (direkt am Anfang des rechten Bereichs), die 4 anderen Icons (ThemeToggle, Community, NotificationBell, UserMenu) nach rechts.

**Neue Reihenfolge im `flex items-center gap-2` Container:**

1. `SocialConnectionIcons` (hidden md:flex, nur wenn user)
2. Spacer oder gap
3. `ThemeToggle`
4. Community Button
5. `NotificationBell`
6. `UserMenu`

Einfach die Position des `SocialConnectionIcons`-Blocks von Zeile 63-67 nach oben verschieben, direkt als erstes Element im Actions-div (Zeile 53).

