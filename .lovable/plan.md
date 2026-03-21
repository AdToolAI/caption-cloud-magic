
# Plan: Kuratierte Musik-Bibliothek mit Kategorie-Mapping

## Idee
Statt bei jedem Render auf die unzuverlässige Jamendo API zu setzen, eine **feste Bibliothek validierter Tracks** in Supabase Storage (`background-music` Bucket, existiert bereits) vorhalten. Die KI wählt basierend auf Kategorie/Mood einen passenden Track aus der Liste, ein zufälliger Abschnitt in der Video-Länge wird per FFmpeg geschnitten und als Hintergrundmusik hinzugefügt.

## Umsetzung

### Schritt 1: Seed-Edge-Function — Tracks herunterladen und in Storage speichern
**Neue Datei:** `supabase/functions/seed-background-music/index.ts`

Einmalige Funktion die 10-15 lizenzfreie Tracks (von Jamendo Streaming-URLs, die zuverlässiger sind als Download-URLs) herunterlädt, Magic-Bytes validiert und in den `background-music` Bucket hochlädt. Dateinamen enthalten Mood-Tags, z.B.:
- `corporate-professional-001.mp3`
- `energetic-upbeat-001.mp3`
- `calm-relaxing-001.mp3`
- `cinematic-dramatic-001.mp3`
- `happy-cheerful-001.mp3`

### Schritt 2: Musik-Katalog als Konstante
**Datei:** `supabase/functions/auto-generate-universal-video/index.ts`

Eine `MUSIC_CATALOG`-Konstante mit Track-Metadaten (Storage-Pfad, Mood-Tags, Genre, Dauer). Die `selectBackgroundMusic`-Funktion wird komplett ersetzt:

1. Mood/Style aus dem Briefing matchen → passende Tracks filtern
2. Zufällig einen Track auswählen
3. Public URL aus Supabase Storage konstruieren (kein Jamendo-API-Call, kein HEAD-Check, kein Proxy nötig)

### Schritt 3: Track auf Video-Länge schneiden via mux-audio-to-video
**Datei:** `supabase/functions/mux-audio-to-video/index.ts`

FFmpeg-Befehl erweitern: Der Track wird mit `-t {videoDuration}` auf die exakte Video-Länge geschnitten und mit Fade-Out (letzte 3 Sekunden) versehen. Da `mux-audio-to-video` bereits FFmpeg nutzt, ist das ein minimaler Zusatz:
```
-af "afade=t=out:st={duration-3}:d=3"
```

### Schritt 4: Pipeline-Integration
**Datei:** `supabase/functions/auto-generate-universal-video/index.ts`

- `selectBackgroundMusic` nutzt nur noch den internen Katalog
- Musik-URL wird wie bisher in `customData.audioTracks.backgroundMusicUrl` geschrieben
- Webhook → `mux-audio-to-video` Pfad bleibt unverändert (funktioniert bereits)
- Kein Jamendo-API-Call mehr im Render-Pfad

## Kategorie-Mood-Mapping

| Kategorie | Mood-Tags |
|-----------|-----------|
| Corporate/Business | professional, corporate, clean |
| Werbung/Advertisement | energetic, upbeat, dynamic |
| Storytelling | emotional, cinematic, warm |
| Tutorial/Erklärung | calm, friendly, light |
| Social Media | happy, trendy, upbeat |
| Motivation | inspirational, epic, powerful |

## Betroffene Dateien

| Datei | Änderung |
|-------|----------|
| `supabase/functions/seed-background-music/index.ts` | Neu: Einmalige Seed-Funktion |
| `supabase/functions/auto-generate-universal-video/index.ts` | `selectBackgroundMusic` auf internen Katalog umstellen |
| `supabase/functions/mux-audio-to-video/index.ts` | Fade-Out + Dauer-Trimming hinzufügen |

## Warum das funktioniert
- Tracks liegen in Supabase Storage → gleiche Domain, kein CORS, kein 403, kein HTML statt MP3
- Einmal validiert, immer gültig — keine externen API-Abhängigkeiten im Render-Pfad
- FFmpeg schneidet den Track auf die Video-Länge → kein abruptes Ende
- Exakt das Prinzip das beim Universal Content Creator funktioniert
