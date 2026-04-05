

## Problem

TikTok-Publishing schlägt fehl mit "Failed to download video from storage", weil `media.path` die **volle öffentliche URL** enthält (z.B. `https://...supabase.co/storage/v1/object/public/media-assets/userId/file.mp4`), aber `supabase.storage.download()` einen **relativen Pfad** erwartet (z.B. `userId/file.mp4`).

Facebook hat diesen Fix bereits (Zeile 633): `media[0].path.replace(/^.*\/media-assets\//, '')`. TikTok fehlt er.

## Lösung

**Datei: `supabase/functions/publish/index.ts`**

Eine Zeile hinzufügen vor dem `supabase.storage.download()` Aufruf bei TikTok (ca. Zeile 822-828):

```typescript
const videoPath = videoMedia.path.replace(/^.*\/media-assets\//, '');
```

Und dann `videoPath` statt `videoMedia.path` an `.download()` übergeben — exakt wie Facebook es bereits macht.

## Ergebnis

Das Video wird korrekt aus dem Storage heruntergeladen und der TikTok-Upload kann weiterlaufen. Der Sandbox-Testpost sollte dann als Draft im TikTok-Konto erscheinen.

