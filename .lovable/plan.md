

## Diagnose: AlbumImagePicker (Sora Studio) — vier echte Bugs

DB-Daten zeigen klar: User haben Alben **mit vielen Bildern** (108, 43, 6, 2, 1) — der Picker müsste sie alle anzeigen. Tut er aber nicht. Hier die Bugs:

### Bug 1: Doppelte System-Alben erscheinen einmal
Manche User haben **zwei** "KI Picture Studio"-Alben (eines mit Bildern, eines leer mit `image_count: 0`). Das leere wird durch `.filter(a => a.image_count > 0)` (Zeile 78) ausgeblendet — das ist ok. Aber der Filter blendet auch andere Alben aus, wenn der Count-Query wegen RLS/Race silent failed.

### Bug 2: N+1 Query mit Promise.all in Promise.all (Zeile 49–73)
Für **jedes Album** zwei zusätzliche Queries (count + cover). Bei 5+ Alben = 10+ parallele Requests. Browser/Supabase rate-limited oder timed-outed → einige Counts kommen als `null` zurück → Album fällt durch's Raster.

### Bug 3: Orphan-Bilder (album_id = NULL) sind unsichtbar
DB zeigt: User `43d88fa6...` hat **48 Bilder ohne album_id**, User `8948d3d9...` hat **17**. Diese Bilder sind im Picker **komplett unauffindbar** — der Picker zeigt nur Bilder, die einer Album-ID zugeordnet sind. User denkt "ich hab so viele Bilder, warum nur 2 Alben?"

### Bug 4: Klick auf Album startet `loadImages` ohne Error-Handling (Zeile 80–93)
`.maybeSingle()` / `.select()` Fehler werden silent geschluckt (kein `.error`-Check, kein Toast). Wenn RLS einen Fehler wirft, scheint das Album "klickt nicht" — wie im Screenshot beschrieben.

### Lösung

**`src/components/media-library/AlbumImagePicker.tsx` umbauen:**

1. **Eine einzige Query statt N+1:**
   ```ts
   // Alben + Counts in einem Roundtrip
   const { data } = await supabase
     .from('studio_albums')
     .select('id, name, cover_image_url, is_system, studio_images(count)')
     .eq('user_id', user.id)
     .order('is_system', { ascending: false })
     .order('name');
   ```
   Damit ist der count garantiert konsistent, kein Race.

2. **Virtuelles "Ohne Album"-Album hinzufügen** für orphan Bilder (`album_id IS NULL`), wenn der User welche hat → die 48 bzw. 17 unsichtbaren Bilder werden auffindbar.

3. **Filter lockern:** `image_count > 0` bleibt, aber leere System-Alben (Default-Album ohne Bilder) werden mit Hint angezeigt statt versteckt — oder konsistent ausgeblendet (System-Album ist sowieso bereits durch das gefüllte ersetzt).

4. **`loadImages` mit Error-Toast:** `if (error) toast.error(...)` — wenn RLS/Network failed, sieht der User es statt eines toten Klicks.

5. **Klick-Handler defensiv:** `disabled={loading}` auf Album-Buttons + Loading-Indikator pro Karte → kein Doppelklick-Race.

### Dateien

1. `src/components/media-library/AlbumImagePicker.tsx` — komplett refactor (eine Query, virtuelles Orphan-Album, Error-Toasts, Disabled-State)

### Was NICHT geändert wird

- DB-Schema bleibt (orphan Bilder sind ein bestehendes Feature, kein Bug)
- Sora Studio (`SoraVideoStudio.tsx`) bleibt — nutzt den Picker nur, keine Änderung am Aufrufer nötig
- Keine Migration nötig (read-only Fix)

