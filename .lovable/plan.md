

## Fix: Eingebrannte Untertitel sauber per KI entfernen

### Das Problem

Die aktuelle Edge Function nutzt ein **fiktives ProPainter-Modell** mit erfundenen Parametern (`mask_type: "rectangle"`, `mask_y_start`, etc.) — das Modell existiert so nicht auf Replicate. Außerdem wird die Video-URL als `image_url` an Gemini gesendet, was fehlschlägt (nur Bilder erlaubt).

### Die Lösung

Es gibt ein echtes, funktionierendes Replicate-Modell genau für diesen Zweck: **`hjunior29/video-text-remover`** — speziell gebaut, um eingebrannte Untertitel und Textüberlagerungen aus Videos zu entfernen. Es nutzt YOLO-Texterkennung + Inpainting und gibt ein sauberes Video zurück.

- Kein Gemini Vision nötig (das Modell erkennt Text selbst)
- Kein manuelles Masking nötig
- Einfacher API-Call: Video rein → sauberes Video raus

### Umsetzung

**1. Edge Function komplett überarbeiten (`supabase/functions/director-cut-remove-burned-subtitles/index.ts`)**

Statt Gemini Vision + fiktivem ProPainter → ein einziger Replicate-Call:

```typescript
const output = await replicate.run(
  "hjunior29/video-text-remover",
  {
    input: {
      video: video_url,
      method: "hybrid",        // Beste Qualität
      conf_threshold: 0.25,    // Erkennungsschwelle
      margin: 5,               // Pixel-Rand um erkannten Text
    },
  }
);
```

- Auth-Check bleibt
- Output ist eine URL zum bereinigten Video
- Download + Upload in Supabase Storage bleibt gleich
- Gemini Vision-Block komplett entfernen (unnötig)
- Timeout in `config.toml` auf 300s setzen (Video-Verarbeitung braucht Zeit)

**2. `supabase/config.toml`** — Timeout für diese Funktion erhöhen auf 300 Sekunden

**3. Frontend bleibt unverändert** — `CapCutEditor.tsx` und `CapCutSidebar.tsx` funktionieren bereits korrekt (Button, State, Video-Swap)

### Betroffene Dateien

1. `supabase/functions/director-cut-remove-burned-subtitles/index.ts` — komplett vereinfacht
2. `supabase/config.toml` — Timeout-Eintrag für die Funktion

