

## Problem
Das Community-Icon (MessageSquare) wurde nur im Landing-Page-Header (`Header.tsx`) eingefuegt, aber nicht im **Dashboard-Header** (`AppHeader.tsx`). Du siehst im eingeloggten Zustand den `AppHeader` — und dort fehlt das Icon.

## Loesung
Das MessageSquare-Icon wird in `src/components/layout/AppHeader.tsx` eingefuegt, direkt neben der NotificationBell im rechten Bereich.

| Datei | Aenderung |
|---|---|
| `src/components/layout/AppHeader.tsx` | `MessageSquare`-Icon als Link zu `/community` einfuegen, positioniert zwischen ThemeToggle und NotificationBell. Nur sichtbar wenn User eingeloggt. |

### Ergebnis
```text
AppHeader:  [AdTool AI] [🔍 Suche] ... [🌙] [💬] [🔔] [👤]
                                              ^^^
                                          Community-Icon (neu)
```

