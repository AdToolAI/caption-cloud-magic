

## Suchleiste weiter links + breiter machen

### Aenderung in `src/components/layout/AppHeader.tsx`

1. **`ml-auto` entfernen** vom CommandBar+SocialIcons Container (Zeile 48) — damit rutscht der Block nach links
2. **`max-w-md` durch `max-w-2xl`** ersetzen (Zeile 49) — macht die Suchleiste ca. 1,5x breiter (md=28rem → 2xl=42rem)
3. **`flex-1`** beibehalten damit die Leiste den verfuegbaren Platz nutzt

```text
Vorher:  [Brand] .................. [CommandBar(max-w-md)] [SocialIcons]  gap-12  [Actions]
Nachher: [Brand] ... [CommandBar(max-w-2xl)] [SocialIcons]               gap-12  [Actions]
```

### Datei
- `src/components/layout/AppHeader.tsx` — Zeile 48-49 anpassen

