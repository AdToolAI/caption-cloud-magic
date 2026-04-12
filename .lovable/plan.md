

## Plan: Kling 3.0 Video Studio Integration

### Überblick
Eigene Seite `/kling-video-studio` für Kling 3.0 Videogenerierung mit den Preisen **€0,15/Sek (Standard 720p)** und **€0,20/Sek (Pro 1080p)**. Nutzt die bestehende Replicate-Integration und das gemeinsame AI-Video-Wallet.

### Preise
| Modell | Preis/Sek | 5 Sek | 10 Sek | 15 Sek |
|--------|-----------|-------|--------|--------|
| Standard (720p) | €0,15 | €0,75 | €1,50 | €2,25 |
| Pro (1080p) | €0,20 | €1,00 | €2,00 | €3,00 |

### Änderungen

**1. `src/config/klingVideoCredits.ts`** (neu)
- Kling-Modelle (standard/pro) mit Preisen €0,15 und €0,20 pro Sekunde
- Dauer 3–15 Sekunden (Slider), Aspect Ratios, Audio-Toggle

**2. `supabase/functions/generate-kling-video/index.ts`** (neu)
- Replicate-Modell: `kwaivgi/kling-v3-omni-video`
- Unterstützt: Text-to-Video, Image-to-Video (Start+End-Frame), Video-to-Video
- Wallet-Check und Credit-Abzug via `deduct_ai_video_credits`
- Webhook über bestehenden `replicate-webhook`

**3. `src/pages/KlingVideoStudio.tsx`** (neu)
- Tabs: Generieren | Credits | Verlauf
- Generieren-Tab: Prompt, Modus (Standard/Pro), Dauer-Slider (3–15s), Aspect Ratio, Audio-Toggle
- Image-to-Video: Start-Bild + optionales End-Bild Upload
- Video-to-Video: Referenz-Video Upload mit Typ-Auswahl
- Echtzeit-Kostenrechner
- Wiederverwendung von `AIVideoCreditPurchase` und `VideoGenerationHistory`

**4. `src/App.tsx`** — Route `/kling-video-studio` hinzufügen

**5. `src/pages/AIVideoStudio.tsx`** — Cross-Link zum Kling Studio (und umgekehrt)

### Keine DB-Änderungen nötig
Die bestehende `ai_video_generations`-Tabelle und das Wallet-System werden wiederverwendet. Kling-Generierungen werden mit `model = 'kling-3-standard'` / `'kling-3-pro'` gespeichert.

### Technische Details
- Replicate Model: `kwaivgi/kling-v3-omni-video`
- REPLICATE_API_KEY ist bereits konfiguriert
- Gemeinsames Wallet: Ein Guthaben für Sora 2 und Kling
- Webhook: Bestehender `replicate-webhook` wird mitgenutzt

