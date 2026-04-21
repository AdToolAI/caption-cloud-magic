

# Plan: Storage Bucket Health Check auf echte Bucket-Namen ausrichten

## Diagnose

Der Test in `supabase/functions/storage-bucket-health/index.ts` prüft auf 5 hartcodierte Bucket-Namen:

```ts
["background-projects", "media-library", "video-renders", "ai-videos", "brand-assets"]
```

Tatsächlich existieren in der Datenbank (22 Buckets insgesamt):

| Erwartet | Real existiert? | Tatsächlicher Name |
|---|---|---|
| `background-projects` | ✅ ja | — |
| `media-library` | ❌ nein | `media-assets` |
| `video-renders` | ❌ nein | `universal-videos` (Final-Renders) |
| `ai-videos` | ✅ ja | — |
| `brand-assets` | ❌ nein | `brand-logos` |

→ 3 von 5 Bucket-Namen sind falsch. Der Test ist deswegen rot — kein echter Storage-Ausfall.

## Lösung

Die `REQUIRED_BUCKETS` Liste an die echte Realität anpassen, mit Fokus auf die wirklich kritischen Buckets für die Plattform:

```ts
const REQUIRED_BUCKETS = [
  "background-projects",   // Smart Background, Picture Studio
  "media-assets",          // Mediathek (Hauptspeicher)
  "ai-videos",             // AI Video Studios (Sora, Kling, etc.)
  "universal-videos",      // Universal Video Creator Renders
  "video-assets",          // Director's Cut Source-Videos
  "audio-assets",          // Voiceover & Music
  "brand-logos",           // Brand Identity
  "thumbnails",            // Video-Thumbnails
];
```

Begründung der Auswahl: Genau die 8 Buckets, deren Ausfall direkt User-sichtbare Fehler verursacht (Upload bricht ab, Video lädt nicht, Avatar fehlt). Buckets wie `audio-temp`, `bug-screenshots` oder `image-captions` sind nicht systemkritisch.

## Geänderte Dateien

- `supabase/functions/storage-bucket-health/index.ts` — `REQUIRED_BUCKETS` Array auf die 8 real existierenden, kritischen Bucket-Namen anpassen

## Verifikation

Nach Deploy „Komplett-Test" auslösen. Erwartung:

- Storage Bucket Health → **grün** (alle 8 Buckets vorhanden)
- 23/23 Szenarien stabil

## Erwartetes Ergebnis

- Test prüft die wirklich existierenden, kritischen Buckets
- Falls künftig ein kritischer Bucket gelöscht wird (z. B. versehentlich), schlägt der Test sofort an
- Keine Phantom-Fehler mehr durch nicht-existente Bucket-Namen

