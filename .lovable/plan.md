

## Fix: Dashboard-Fehler + Header-Icon-Sortierung

### Problem 1: "Cannot read properties of undefined (reading 'color')"
Die `StatusPill`-Komponente kennt nur `draft | scheduled | published | failed`, aber `WeekPost.status` kann `suggested` oder `missed` sein. Wenn der naechste Post z.B. Status `suggested` hat, crasht `statusConfig[status]` mit `undefined`.

**Fix in `src/components/ui/StatusPill.tsx`:**
- `suggested` und `missed` zum `statusConfig` hinzufuegen
- Fallback einbauen falls ein unbekannter Status kommt

### Problem 2: Header-Icons schlecht sortiert
Aktuell sind die 6 Social-Icons direkt neben ThemeToggle, VOR den 4 bisherigen Icons (Community, Notifications etc.). Die Social-Icons sollen weiter rechts stehen.

**Fix in `src/components/layout/AppHeader.tsx`:**
- `SocialConnectionIcons` nach rechts verschieben: nach Community + NotificationBell, vor UserMenu
- Reihenfolge: ThemeToggle → Community → NotificationBell → SocialConnectionIcons → UserMenu

### Dateien
1. `src/components/ui/StatusPill.tsx` — `suggested` + `missed` Status hinzufuegen + Fallback
2. `src/components/layout/AppHeader.tsx` — SocialConnectionIcons Position aendern

