

## Plan: Album-Thumbnails und KI-Bilder Auto-Zuordnung verbessern

### Problem 1: Album-Cover zeigt schwarzen/leeren Hintergrund
Die Alben haben kein `cover_image_url` gesetzt. Statt nur den Fallback-Icon zu zeigen, soll dynamisch das **zuletzt hinzugefügte Bild** des Albums als Thumbnail angezeigt werden.

### Problem 2: KI-Bilder sollen zuverlässig im "KI Picture Studio"-Album landen
Die Frontend-Logik existiert bereits, aber die Zuordnung soll zusätzlich direkt in der Edge Function passieren, damit es zuverlässiger ist (kein Race-Condition-Risiko).

### Änderungen

**1. `src/components/media-library/MediaAlbumManager.tsx`**
- Beim Laden der Alben: Für jedes Album ohne `cover_image_url` das neueste Bild aus `studio_images` laden und als dynamisches Cover verwenden
- Query: `studio_images` nach `album_id` filtern, `order by created_at desc`, `limit 1`, Feld `image_url` nutzen

**2. `supabase/functions/generate-studio-image/index.ts`**
- Nach dem Speichern des Bildes in `studio_images`: Direkt in der Edge Function das "KI Picture Studio" System-Album finden/erstellen und die `album_id` beim Insert setzen (statt nachträglich per Update vom Frontend)
- Das entfernt die Abhängigkeit vom Frontend-Code für die Album-Zuordnung

**3. `src/components/media-library/AlbumImagePicker.tsx`**
- Gleiche Logik: Dynamisches Cover-Bild laden wenn `cover_image_url` null ist

### Betroffene Dateien
- `src/components/media-library/MediaAlbumManager.tsx` — dynamisches Album-Cover
- `src/components/media-library/AlbumImagePicker.tsx` — dynamisches Album-Cover
- `supabase/functions/generate-studio-image/index.ts` — album_id direkt beim Insert setzen

