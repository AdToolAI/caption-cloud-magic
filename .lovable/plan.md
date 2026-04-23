

## Composer-Crash nach TikTok-Connect beheben — `Failed to execute 'createObjectURL'`

### Root Cause
Der Kunde landet nach erfolgreichem TikTok-OAuth zurück in der App. Im **Composer** (`src/pages/Composer.tsx`, Zeile 861) wird beim Rendern des „Social"-Tabs aufgerufen:

```tsx
videoUrl={selectedMedia[0] ? URL.createObjectURL(selectedMedia[0]) : importedMediaUrl || ''}
```

`selectedMedia[0]` ist aber **nicht immer** ein echter `File`/`Blob`. Beim Import aus der MediaLibrary erzeugt der Composer in Zeilen 218–238 ein **virtuelles Objekt**:

```ts
const virtualFile = { name, type, size, url: data.mediaUrl } as File & { url: string };
setSelectedMedia([virtualFile]);
```

Das ist nur ein Plain Object mit `as File` gecastet. `URL.createObjectURL(...)` akzeptiert ausschließlich echte `Blob`/`File`/`MediaSource` und wirft exakt den Browser-Fehler:

> `Failed to execute 'createObjectURL' on 'URL': Overload resolution failed.`

Der Fehler bubbled hoch in den `ErrorBoundary` → Kunde sieht „Etwas ist schiefgelaufen". Mit TikTok hat das nichts zu tun — der Crash ist nur **danach** sichtbar, weil der Composer-State nach dem Redirect den importierten Media-Eintrag noch enthält.

Zusätzlich: `URL.createObjectURL` wird bei jedem Render neu aufgerufen → Memory Leak.

### Fix

**Datei 1: `src/pages/Composer.tsx`**

Statt direkt `URL.createObjectURL(selectedMedia[0])` aufzurufen, eine `useMemo`-basierte sichere Resolver-Funktion einführen, die:
1. zuerst prüft, ob das Item bereits ein `url`-Feld hat (virtuelles File aus der MediaLibrary) → diese URL verwenden
2. dann prüft, ob es ein echter `Blob`/`File` ist (`instanceof Blob`) → `URL.createObjectURL()` nutzen
3. sonst auf `importedMediaUrl` oder leeren String zurückfallen
4. die erzeugte Object-URL bei Cleanup wieder freigeben (`URL.revokeObjectURL`)

```tsx
const composerMediaUrl = useMemo(() => {
  const first = selectedMedia[0] as (File & { url?: string }) | undefined;
  if (!first) return importedMediaUrl || '';
  if (first.url) return first.url;                       // virtuelles File aus MediaLibrary
  if (first instanceof Blob) return URL.createObjectURL(first);
  return importedMediaUrl || '';
}, [selectedMedia, importedMediaUrl]);

useEffect(() => {
  return () => {
    if (composerMediaUrl?.startsWith('blob:')) URL.revokeObjectURL(composerMediaUrl);
  };
}, [composerMediaUrl]);
```

Dann in Zeile 861 nur noch `videoUrl={composerMediaUrl}` verwenden.

**Datei 2: `src/components/composer/ComposerPreview.tsx`** (gleiches Muster, härten)

In Zeile 43–48 zusätzlich den `instanceof Blob`-Check ergänzen, damit auch dort kein Crash auftritt, falls künftig ein nicht-Blob-Item reinkommt:

```tsx
const mediaPreviewUrl = useMemo(() => {
  if (selectedMedia.length === 0) return null;
  const file = selectedMedia[0] as File & { url?: string };
  if (file.url) return file.url;
  if (file instanceof Blob) return URL.createObjectURL(file);
  return null;
}, [selectedMedia]);
```

Und Cleanup-Effect ergänzen, der die `blob:`-URL bei Unmount/Wechsel revoked.

### Was nicht geändert wird
- TikTok-OAuth-Flow (funktioniert korrekt — Kunde war ja erfolgreich verbunden)
- ConnectionsTab (kein `createObjectURL`-Bug)
- ErrorBoundary selbst (das ist genau das, was es soll — Crash abfangen)

### Erwartetes Ergebnis
- Kein Crash mehr nach TikTok-Connect, wenn der Composer importierte Media im State hat
- Robust für alle Media-Quellen (File-Upload, MediaLibrary-Import, AI-generated)
- Keine Memory Leaks durch nicht-revoked Object-URLs

### Betroffene Dateien
- `src/pages/Composer.tsx` (Zeilen ~42–50 und ~861)
- `src/components/composer/ComposerPreview.tsx` (Zeilen 43–48)

### Test nach Umsetzung
1. MediaLibrary-Item in den Composer importieren
2. Auf den „Social"-Tab klicken → kein Crash
3. TikTok neu verbinden → zurück in der App → kein Crash
4. Echten Datei-Upload im Composer machen → Preview funktioniert weiter

