

## Suchleiste + Social-Icons nach rechts verschieben, Abstand zum Mond-Icon

### Aenderung in `src/components/layout/AppHeader.tsx`

Aktuell hat die CommandBar `flex-1 max-w-md mx-4` und die SocialIcons `mr-auto` — das drueckt beides weit nach links.

**Fixes:**
1. `mr-auto` von den SocialIcons entfernen — die sollen nicht mehr alles nach links druecken
2. CommandBar und SocialIcons zusammen in einen gemeinsamen Container packen, der sich mehr zur Mitte/rechts orientiert
3. Zwischen SocialIcons und den rechten Actions (ThemeToggle etc.) einen expliziten Abstand von `gap-12` (~3rem ≈ 3cm auf Standardbildschirmen) einfuegen

**Neues Layout:**
```text
[Brand] ....... [CommandBar] [SocialIcons]     gap-12     [ThemeToggle | Community | Bell | UserMenu]
```

Konkret: CommandBar und SocialIcons in ein gemeinsames Flex-div mit `ml-auto` wrappen, und das aeussere Container-div bekommt `gap-12` statt `gap-4` zwischen diesem Block und den rechten Actions. Alternativ einfacher: `mr-12` auf den SocialIcons-Container setzen.

### Datei
- `src/components/layout/AppHeader.tsx` — Layout-Anpassung

