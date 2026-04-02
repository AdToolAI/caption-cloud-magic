

## Fix: Löschfunktion für Video-Creator-Medien in der Mediathek

### Problem

In `handleDelete` (Zeile 462–507 in `MediaLibrary.tsx`) fehlt der Fall `source === 'video-creator'`. Videos aus dem Video Creator werden aus der `video_creations`-Tabelle geladen, aber beim Löschen wird kein `DELETE` ausgeführt — die Funktion springt direkt zum Toast "Gelöscht", ohne tatsächlich etwas zu löschen.

### Lösung

In `handleDelete` einen neuen `else if`-Zweig für `video-creator` hinzufügen:

```typescript
} else if (mediaItem.source === 'video-creator') {
  const { error } = await supabase
    .from('video_creations')
    .delete()
    .eq('id', id);
  if (error) throw error;
}
```

Zusätzlich: Auch Videos mit `source === 'ai'` die aus `video_creations` stammen (Sora AI, Director's Cut) werden aktuell fälschlicherweise gegen `content_items` gelöscht. Diese werden ebenfalls korrigiert, indem geprüft wird ob `type === 'video'` und dann gegen `video_creations` gelöscht wird.

### Betroffene Datei

`src/pages/MediaLibrary.tsx` — `handleDelete`-Funktion erweitern

