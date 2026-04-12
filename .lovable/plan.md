

## Plan: Seedance 2.0 Video Studio

Eigene Seite `/seedance-video-studio` für Seedance 2.0 (ByteDance) — nach dem gleichen Muster wie Kling 3.0.

### Replicate-Modell
Seedance 2.0 ist auf Replicate verfügbar als `bytedance/seedance-1-lite` (aktuell verfügbare Version). Unterstützt Text-to-Video und Image-to-Video.

### Preise
Bevor ich implementiere: Welche Preise pro Sekunde sollen für Seedance gelten?

| Modell | Vorschlag |
|--------|-----------|
| Seedance Standard | €0,15/Sek? |
| Seedance Pro | €0,20/Sek? |

Oder soll es nur ein Modell geben (wie bei Seedance Lite)?

### Umfang (analog zu Kling)

**1. Config: `src/config/seedanceVideoCredits.ts`**
- Modell-Definition mit Preisen, Dauer (3-15s), Aspect Ratios
- Export der Typen

**2. Edge Function: `supabase/functions/generate-seedance-video/index.ts`**
- Auth + Wallet-Prüfung + Credits-Abzug
- Replicate API-Aufruf für Seedance
- DB-Eintrag in `ai_video_generations`
- Webhook über bestehenden `replicate-webhook`

**3. Seite: `src/pages/SeedanceVideoStudio.tsx`**
- Prompt-Eingabe mit VideoPromptOptimizer
- Modell-/Dauer-/Aspect-Ratio-Auswahl
- Image-to-Video Upload
- Wallet-Anzeige + Credit-Kauf
- Generierungs-History (gemeinsam)
- Prompt-Tipps

**4. Routing: `src/App.tsx`**
- Route `/seedance-video-studio` hinzufügen

**5. Cross-Links**
- Links von AIVideoStudio und KlingVideoStudio zu Seedance (und umgekehrt)

**6. History: `VideoGenerationHistory.tsx`**
- `MODEL_DISPLAY_NAMES` um Seedance-Modelle erweitern

### Keine DB-Änderungen nötig
Bestehende `ai_video_generations`-Tabelle und Wallet werden wiederverwendet.

### Offene Frage
Bitte kurz bestätigen: **Welche Preise pro Sekunde** und **welche Modellvarianten** (Standard/Pro oder nur eine)?

