

# Plan: Edge Functions redeployen + Musik-Seed ausführen

## Diagnose

**Die r66-Änderungen wurden nie deployed.** Die Runtime-Logs zeigen `BUILD_TAG=r59`, obwohl der Code im Repo bereits den MUSIC_CATALOG und die interne Musikauswahl enthält. Zusätzlich wurde die `seed-background-music` Funktion nie aufgerufen — der `background-music` Storage-Bucket ist leer.

Das erklärt, warum nie Hintergrundmusik ankommt:
- Im **deployed** Code (r59) wird noch die alte Jamendo-basierte Musiksuche verwendet
- Diese scheitert konsistent (HTML statt MP3), daher `musicUrl = null`
- Der Webhook bekommt `backgroundMusicUrl: "NONE"` → kein Muxing

## Was zu tun ist

### Schritt 1: BUILD_TAG auf r66 aktualisieren
**Datei:** `supabase/functions/auto-generate-universal-video/index.ts`

Den BUILD_TAG von `r59-audio-direct-render-2026-03-20` auf `r66-internal-music-catalog-2026-03-21` ändern, damit wir in den Logs sehen können, dass die richtige Version läuft.

### Schritt 2: Edge Functions deployen
Alle drei betroffenen Funktionen deployen:
- `auto-generate-universal-video` (MUSIC_CATALOG + interne Auswahl)
- `mux-audio-to-video` (Fade-Out + Duration-Trimming)
- `seed-background-music` (zum Befüllen des Buckets)

### Schritt 3: Seed-Funktion aufrufen
`seed-background-music` ausführen, um die 8 kuratierten Tracks in den `background-music` Bucket hochzuladen.

### Schritt 4: Validieren
Prüfen, dass die Tracks im Storage liegen und die URLs erreichbar sind.

## Betroffene Dateien

| Datei | Änderung |
|-------|----------|
| `supabase/functions/auto-generate-universal-video/index.ts` | BUILD_TAG aktualisieren |

## Technischer Kern
Der Code ist korrekt, er war nur nie deployed. Nach dem Deployment + Seed sollte die Musik funktionieren.

