

## Social-Icons: Dashboard entfernen + Header weiter links

### Aenderung 1: `src/pages/Home.tsx`
- Zeile 482: `<SocialConnectionIcons />` entfernen
- Zeile 8: Import entfernen

### Aenderung 2: `src/components/layout/AppHeader.tsx`
- `SocialConnectionIcons` aus dem rechten Actions-`div` herausnehmen
- Als eigenes Element zwischen CommandBar und Actions-div platzieren, mit `hidden md:flex items-center`
- So stehen die Social-Icons visuell links, getrennt von den 4 System-Icons rechts

```text
[Brand] ... [CommandBar] ... [SocialIcons]    [ThemeToggle | Community | Bell | UserMenu]
```

