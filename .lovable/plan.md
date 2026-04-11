

## Plan: "Alle"-Tab nur Videos anzeigen, Bilder nur in Alben

### Änderung

In `src/pages/MediaLibrary.tsx`, Zeile 388-391 — der Filter für den "all"-Tab wird so angepasst, dass **nur Videos** angezeigt werden. Bilder (type `image`) werden komplett aus dem "Alle"-Tab ausgeschlossen und sind nur noch über den "Alben"-Tab erreichbar.

### Technisches Detail

Aktuelle Logik (Zeile 388-391):
```typescript
} else {
  // "all" tab: exclude ai_generator images (they live in Albums only)
  filtered = filtered.filter(item => item.source !== 'ai_generator');
}
```

Neue Logik:
```typescript
} else {
  // "all" tab: only show videos, images are only in Albums
  filtered = filtered.filter(item => item.type === 'video');
}
```

Das betrifft auch den **Uploads**-Tab — dort werden aktuell sowohl Bilder als auch Videos angezeigt. Soll der Uploads-Tab ebenfalls nur Videos zeigen, oder sollen hochgeladene Bilder dort weiterhin sichtbar sein?

### Betroffene Datei
- `src/pages/MediaLibrary.tsx` — eine Zeile ändern

