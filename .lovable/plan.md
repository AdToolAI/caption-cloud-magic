
## Fix: Edge Function failed beim Bild-Generieren

### Ursache
Ich habe die Runtime-Logs der Backend-Funktion geprüft. Der Fehler ist **nicht mehr CORS** und auch **nicht Deploy**.

Der echte Fehler ist:

```text
Upload error: StorageApiError: new row violates row-level security policy
Failed to upload image
```

### Exaktes Problem
In `supabase/functions/generate-studio-image/index.ts` wird aktuell in diesen Pfad hochgeladen:

```ts
studio/${user.id}/${Date.now()}_${style}.png
```

Die Storage-Policy fuer den Bucket `background-projects` verlangt aber, dass **der erste Ordnername die User-ID ist**:

```sql
auth.uid()::text = (storage.foldername(name))[1]
```

Das heisst:
- aktuell: erster Ordner = `studio` -> **RLS blockiert**
- korrekt: erster Ordner = `user.id` -> **Upload erlaubt**

Zum Vergleich: Der bestehende Smart-Background-Code in `src/pages/BackgroundReplacer.tsx` nutzt bereits korrekt:

```ts
${user.id}/${Date.now()}...
```

### Aenderung
#### `supabase/functions/generate-studio-image/index.ts`
Den Upload-Pfad an die bestehende Bucket-Policy anpassen, z. B.:

```ts
const fileName = `${user.id}/studio/${Date.now()}_${style}.png`;
```

oder einfacher:

```ts
const fileName = `${user.id}/${Date.now()}_${style}.png`;
```

Wichtig ist nur: **`user.id` muss der erste Pfadteil sein**.

### Zusaetzliche Haertung
In derselben Funktion verbessere ich noch die Fehlerbehandlung:
- Storage-Fehler klar loggen
- bei Upload-Fehlern eine praezisere Fehlermeldung zurueckgeben statt nur generischem 500

### Dateien
1. `supabase/functions/generate-studio-image/index.ts` — Upload-Pfad korrigieren
2. optional derselbe File — klarere Storage-Error-Responses

### Ergebnis nach dem Fix
- Bildgenerierung laeuft durch
- Datei wird korrekt im Bucket gespeichert
- `studio_images` kann anschliessend normal beschrieben werden
- der 500-Fehler beim Funktionsaufruf verschwindet
