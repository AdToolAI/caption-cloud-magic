

## Plan: Bilder-Zähler soll alle Album-Bilder (studio_images) mitzählen

### Problem
Der Bilder-Zähler im Header (`X / 2.500`) zählt nur Bilder aus `content_items` und `media_assets`. Die KI-generierten Bilder in `studio_images` (die nur über Alben erreichbar sind) werden nicht mitgezählt.

### Lösung

**Datei: `src/pages/MediaLibrary.tsx`**

Beim Laden der Mediathek-Daten (in der `loadMedia`-Funktion, ca. Zeile 200-347) wird eine zusätzliche count-Query auf `studio_images` ausgeführt:

```typescript
const { count: studioImageCount } = await supabase
  .from('studio_images')
  .select('id', { count: 'exact', head: true })
  .eq('user_id', user.id);
```

Dann wird der `imageCount` in der Berechnung (Zeile 802) angepasst, sodass er die Studio-Bilder mit einbezieht. Dafür wird der `studioImageCount` als State gespeichert und zum bestehenden `imageCount` addiert:

```typescript
const imageCount = media.filter(m => m.type === 'image').length + studioImageCount;
```

### Betroffene Datei
- `src/pages/MediaLibrary.tsx` — neuer State `studioImageCount`, zusätzliche DB-Query, angepasste Berechnung

