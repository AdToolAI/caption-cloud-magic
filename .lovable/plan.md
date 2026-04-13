

## Plan: MiniMax Hailuo 2.3 + Luma Ray 2 Integration

### Übersicht
Zwei neue KI-Video-Anbieter werden nach dem bestehenden Muster (Wan/Seedance/Kling) integriert.

### Neue Anbieter

| Anbieter | Replicate-Modell | Dauer | Auflösung | Preis/Sek |
|----------|-----------------|-------|-----------|-----------|
| **MiniMax Hailuo 2.3** | `minimax/hailuo-2.3` | 6s / 10s | 768p / 1080p (1080p nur 6s) | Standard: €0.15, Pro: €0.20 |
| **Luma Ray 2** | `luma/ray-2-720p` | 5s / 9s | 720p | Standard: €0.18, Pro: €0.25 |

### API-Parameter

**Hailuo 2.3**: `prompt`, `duration` (6|10), `resolution` ("768p"|"1080p"), `first_frame_image`, `prompt_optimizer`
**Luma Ray 2**: `prompt`, `duration` (5|9), `aspect_ratio` ("16:9"|"9:16"|"1:1"), `start_image`, `end_image`, `loop`, `concepts`

### Dateien

**Neu erstellen (6 Dateien):**
1. `src/config/hailuoVideoCredits.ts` — Modell-Config, Preise, Typen
2. `src/config/lumaVideoCredits.ts` — Modell-Config, Preise, Typen
3. `src/pages/HailuoVideoStudio.tsx` — Studio-Seite (nach Wan-Pattern), Duration Toggle 6s/10s, Resolution-Auswahl
4. `src/pages/LumaVideoStudio.tsx` — Studio-Seite, Duration Toggle 5s/9s, Kamera-Konzepte (Optional)
5. `supabase/functions/generate-hailuo-video/index.ts` — Edge Function: Auth, Wallet, Replicate `minimax/hailuo-2.3`
6. `supabase/functions/generate-luma-video/index.ts` — Edge Function: Auth, Wallet, Replicate `luma/ray-2-720p`

**Editieren (3 Dateien):**
7. `src/App.tsx` — Lazy-Import + Routes `/hailuo-video-studio`, `/luma-video-studio`
8. `src/pages/AIVideoStudio.tsx` — Zwei neue Provider-Karten im Hub-Grid (6 Karten total, 3x2)
9. `src/components/ai-video/VideoGenerationHistory.tsx` — `MODEL_DISPLAY_NAMES` erweitern

### Hub-Karten (neu)

```
Hailuo 2.3 | MiniMax
"Realistische Gesichter, Bewegung & Charaktere"
Features: Text-to-Video, Image-to-Video, 1080p, Realistic Motion
Preis: €0.15–0.20/s | Max: 10s | Qualität: 1080p

Luma Ray 2 | Luma AI  
"Cinematic Szenen, surreale & künstlerische Projekte"
Features: Text-to-Video, Image-to-Video, Camera Concepts, Loop
Preis: €0.18–0.25/s | Max: 9s | Qualität: 720p
```

### Keine DB-Änderungen nötig
Bestehende `ai_video_generations`-Tabelle und Wallet werden wiederverwendet.

