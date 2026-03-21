

# Plan: Musik-Bibliothek auf 100+ Tracks skalieren

## Aktueller Stand
- 8 hardcodierte Tracks in `MUSIC_CATALOG` (auto-generate-universal-video)
- 13 hardcodierte Jamendo-IDs in `seed-background-music`
- Tracks liegen im `background-music` Storage-Bucket

## Problem mit dem aktuellen Ansatz
100+ Tracks als hardcodierte Jamendo-IDs pflegen ist nicht wartbar. Stattdessen brauchen wir:
1. Eine **Datenbank-Tabelle** für Track-Metadaten (statt hardcodierter Konstante)
2. Eine **dynamische Seed-Funktion** die per Jamendo-API automatisch Tracks pro Kategorie sucht und herunterlädt
3. Die **Auswahl-Logik** liest zur Render-Zeit aus der DB statt aus einer Konstante

## Umsetzung

### Schritt 1: DB-Tabelle `background_music_tracks` anlegen

```sql
CREATE TABLE public.background_music_tracks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  storage_path TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  mood TEXT NOT NULL,
  genre TEXT NOT NULL,
  moods TEXT[] NOT NULL DEFAULT '{}',
  source_id TEXT,          -- Jamendo Track ID
  duration_seconds INTEGER,
  file_size_bytes INTEGER,
  is_valid BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

Keine RLS nötig — wird nur von Edge Functions mit Service Role Key gelesen.

### Schritt 2: Seed-Funktion komplett umbauen
**Datei:** `supabase/functions/seed-background-music/index.ts`

Statt hardcodierter IDs: **Jamendo-API per Kategorie abfragen** und automatisch 15-20 Tracks pro Kategorie herunterladen.

Kategorien (7 Stück × ~15 Tracks = ~105 Tracks):

| Kategorie | Jamendo-Tags |
|-----------|-------------|
| Corporate | corporate, business, professional |
| Energetic | energetic, upbeat, dynamic |
| Calm | calm, relax, ambient |
| Cinematic | cinematic, dramatic, epic |
| Happy | happy, cheerful, fun |
| Inspirational | inspirational, motivational |
| Acoustic | acoustic, folk, warm |

Ablauf pro Kategorie:
1. Jamendo API: `GET /tracks/?tags={tag}&limit=20&audioformat=mp32`
2. Für jeden Track: Download → Magic-Byte-Validierung → Re-Upload zu Storage
3. Metadaten in `background_music_tracks` Tabelle speichern
4. Bereits vorhandene Tracks überspringen (Duplikat-Check via `source_id`)

### Schritt 3: `selectBackgroundMusic` auf DB umstellen
**Datei:** `supabase/functions/auto-generate-universal-video/index.ts`

Die hardcodierte `MUSIC_CATALOG`-Konstante ersetzen durch einen DB-Query:

```typescript
const { data: tracks } = await supabase
  .from('background_music_tracks')
  .select('*')
  .eq('is_valid', true)
  .overlaps('moods', searchTerms);
```

Fallback: wenn kein Mood-Match, zufälligen Track aus der ganzen Tabelle nehmen.

### Schritt 4: Seed ausführen
Die Funktion einmal aufrufen — sie füllt automatisch ~100+ Tracks in Storage + DB.

## Betroffene Dateien

| Datei | Änderung |
|-------|----------|
| Migration | Neue Tabelle `background_music_tracks` |
| `supabase/functions/seed-background-music/index.ts` | Komplett umbauen: dynamisch per Kategorie von Jamendo |
| `supabase/functions/auto-generate-universal-video/index.ts` | `MUSIC_CATALOG` → DB-Query ersetzen |

## Erwartetes Ergebnis
- 100+ validierte Tracks im Storage, nach Mood/Genre getaggt
- Jede Kategorie hat mindestens 15 passende Tracks
- Track-Auswahl ist dynamisch und erweiterbar (neue Tracks = neuer Seed-Run)
- Keine hardcodierten Listen mehr

