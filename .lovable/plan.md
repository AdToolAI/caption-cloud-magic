

## Plan: Wan 2.1 Video Studio

Neue Seite `/wan-video-studio` für Wan 2.1 (WaveSpeed/wan-video) — nach dem bewährten Muster von Seedance/Kling.

### Replicate-Modell
- **Text-to-Video**: `wavespeedai/wan-2.1-t2v-720p` (Standard) — schnelle Inferenz
- **Image-to-Video**: `wavespeedai/wan-2.1-i2v-720p`
- Parameter: `prompt`, `aspect_ratio` (16:9, 9:16, 1:1), `seed`
- Output: Video-URL direkt (kein Webhook nötig bei WaveSpeed, aber wir nutzen den bestehenden Webhook-Flow)

### Preise
| Modell | Preis/Sek |
|--------|-----------|
| Wan Standard (720p) | €0,10 / $0,10 |
| Wan Pro (1080p) | €0,15 / $0,15 |

### Umfang

**1. Config: `src/config/wanVideoCredits.ts`**
- Modell-Definition mit Preisen, Dauer (3–12s), Aspect Ratios
- Typen exportieren

**2. Edge Function: `supabase/functions/generate-wan-video/index.ts`**
- Auth + Wallet-Prüfung + Credits-Abzug (via `deduct_ai_video_credits`)
- Replicate API-Aufruf für `wavespeedai/wan-2.1-t2v-720p`
- Image-to-Video via `wavespeedai/wan-2.1-i2v-720p`
- DB-Eintrag in `ai_video_generations`
- Webhook über bestehenden `replicate-webhook`
- Duration-Cap als Sicherheitsnetz

**3. Seite: `src/pages/WanVideoStudio.tsx`**
- Prompt-Eingabe mit VideoPromptOptimizer
- Modell-/Dauer-/Aspect-Ratio-Auswahl
- Image-to-Video Upload
- Wallet-Anzeige + Credit-Kauf
- Generierungs-History
- Prompt-Tipps

**4. Routing: `src/App.tsx`**
- Lazy-Import + Route `/wan-video-studio`

**5. Cross-Links**
- Navigation-Buttons in AIVideoStudio, KlingVideoStudio, SeedanceVideoStudio → Wan 2.1
- Und umgekehrt von Wan zu den anderen Studios

**6. History: `VideoGenerationHistory.tsx`**
- `MODEL_DISPLAY_NAMES` um `wan-standard` / `wan-pro` erweitern

### Keine DB-Änderungen nötig
Bestehende `ai_video_generations`-Tabelle und Wallet werden wiederverwendet.

### Dateien
- **Neu**: `src/config/wanVideoCredits.ts`, `src/pages/WanVideoStudio.tsx`, `supabase/functions/generate-wan-video/index.ts`
- **Edit**: `src/App.tsx`, `src/components/ai-video/VideoGenerationHistory.tsx`, `src/pages/AIVideoStudio.tsx`, `src/pages/KlingVideoStudio.tsx`, `src/pages/SeedanceVideoStudio.tsx`

