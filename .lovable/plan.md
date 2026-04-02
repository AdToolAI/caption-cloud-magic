

## Fix: "Automatisch sauber entfernen" schlägt fehl — Bildformat nicht unterstützt

### Problem

Die Edge Function `director-cut-detect-subtitle-band` sendet die **Video-URL (.mp4)** direkt an Gemini Vision. Gemini akzeptiert aber nur Bildformate (PNG, JPEG, WebP, GIF):

```
Unsupported image format for URL: ...out.mp4. Supported formats: PNG, JPEG, WebP, GIF.
```

### Lösung

Statt das Video an die KI zu schicken, extrahieren wir im Browser einen **Screenshot-Frame** als JPEG Data-URL und senden diesen an die Edge Function. Das ist schnell, zuverlässig und braucht kein serverseitiges ffmpeg.

### Umsetzung

**1. `src/components/directors-cut/studio/CapCutEditor.tsx`**

Neue Helper-Funktion `captureVideoFrame()`:
- Erstellt ein temporäres `<video>` Element mit der `videoUrl`
- Seeked auf 25% der Videodauer (damit ein repräsentativer Frame mit Untertitel sichtbar ist)
- Zeichnet den Frame auf ein `<canvas>` und exportiert als JPEG Data-URL
- Sendet diese Data-URL statt der Video-URL an die Edge Function

```text
handleDetectSubtitleBand:
  1. frame_data_url = await captureVideoFrame(videoUrl)
  2. supabase.functions.invoke('detect-subtitle-band', { body: { video_url: frame_data_url } })
```

**2. `supabase/functions/director-cut-detect-subtitle-band/index.ts`**

- Akzeptiert jetzt auch Data-URLs (beginnen mit `data:image/`)
- Keine weitere Änderung nötig — Gemini kann Data-URLs direkt verarbeiten

### Fallback

Falls die Frame-Extraktion scheitert (CORS bei externer Video-URL), greift der bestehende Fallback: Medium-Preset wird automatisch angewendet.

### Betroffene Dateien

1. `src/components/directors-cut/studio/CapCutEditor.tsx` — Frame-Capture + angepasster API-Call
2. `supabase/functions/director-cut-detect-subtitle-band/index.ts` — Input-Validierung anpassen

