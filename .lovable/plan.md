
# Plan: Veo 3.1 Lite Studio – Audio-Native Video Generation

## 🎯 Strategisches Ziel

Artlist hat Veo 3.1 Lite als USP positioniert (Video + Audio in einem Pass). Wir kontern, indem wir den **gleichen Google-Standard** in unser Studio holen — **als 7. Provider neben Kling, Wan, Hailuo, Luma, Seedance, Sora 2**. Damit bleiben wir das einzige Tool am Markt, das Veo 3.1 Lite **innerhalb eines vollständigen Production-Workflows** (Director's Cut, Composer, Social Publishing) anbietet — Artlist hat „nur" Generation.

## 🔑 USP gegenüber Artlist

| Feature | Artlist Veo 3.1 | **AdTool Veo 3.1** |
|---|---|---|
| Video + Audio Native | ✅ | ✅ |
| Charakter-Bibliothek (cross-model) | ❌ | ✅ (Motion Studio Library) |
| Director's Cut Post-Production | ❌ | ✅ |
| Direct Social Publishing | ❌ | ✅ (5 Plattformen) |
| Multi-Model A/B (Veo vs. Kling vs. Sora) | ❌ | ✅ (Compare Lab) |

## 📦 Lieferumfang

### 1. Edge Function: `supabase/functions/generate-veo-video/index.ts` (NEU)
- **Replicate-Modell**: `google/veo-3.1-fast` (= Veo 3.1 Lite, ~$0.40/s laut Replicate-Listing)
- **Inputs**: `prompt`, `duration` (4s/6s/8s), `aspectRatio` (16:9, 9:16), `startImageUrl?`, `generateAudio` (default: true), `negativePrompt?`
- **Pricing-Wallet**: `EUR 0.40 / USD 0.40` pro Sekunde (Standard), Pro-Variante `google/veo-3.1` mit `EUR 0.65/s` als Premium-Option
- **Pattern**: Identisch zu `generate-wan-video` (Reservation → Replicate-Webhook → Commit/Refund über `credit-reserve`/`credit-commit`/`credit-refund`)
- **Audio-Track**: Replicate liefert Video mit eingebettetem Audio → direkter Upload zu `ai-video-generations` Storage-Bucket
- CORS-Header und Auth wie alle bestehenden Provider-Functions

### 2. Webhook: `supabase/functions/veo-video-webhook/index.ts` (NEU)
- Verarbeitet `succeeded`/`failed` Events von Replicate
- Lädt das fertige Video herunter, lädt es in Storage hoch, aktualisiert `ai_video_generations.status` + `video_url`
- Triggert Credit-Commit oder Refund

### 3. Frontend: `src/pages/VeoVideoStudio.tsx` (NEU)
- Klone `SoraVideoStudio.tsx` als Basis (gleiche Glassmorphism-UI, James Bond 2028)
- Spezielle UI-Sektion: **„Audio-Native Generation"** mit Toggle für „Mit Sound generieren" (default ON) + Beispiel-Hinweis: „z. B. *‚A glass shattering with crystal clarity'* erzeugt automatisch das Geräusch"
- Integration des bestehenden `VideoPromptOptimizer` (auto-Übersetzung + Cinematic-Enrichment)
- Reuse: `useAIVideoWallet`, `VideoGenerationHistory`, Credit-Anzeige

### 4. Config: `src/config/veoVideoCredits.ts` (NEU)
- Schema analog zu `wanVideoCredits.ts`
- Modelle: `veo-3.1-lite` (Standard), `veo-3.1` (Pro)
- Allowed Durations: `[4, 6, 8]`, AspectRatios: `['16:9', '9:16']`

### 5. Hub-Integration: `src/pages/AIVideoStudio.tsx`
- Neuer Provider-Card-Eintrag „Veo 3.1 Lite" mit Badge **„🎵 Native Audio"** als Differentiator
- Position: **Slot 2** (nach Kling, vor Wan), da Audio-Native das Premium-Verkaufsargument ist
- Update Hero-Subtitle: „6 KI-Modelle" → **„7 KI-Modelle"** (alle 3 Sprachen)

### 6. Routing: `src/App.tsx`
- Neue Route `/veo-video-studio` → `VeoVideoStudio.tsx`

### 7. Secret Setup
- Bereits vorhanden: `REPLICATE_API_KEY` (von Wan/Luma/Hailuo/Seedance verwendet) → **kein neuer Secret nötig**

### 8. Legal Compliance
- `AIVideoDisclaimer.tsx` ergänzen: Veo 3.1 Lite Hinweis (Google Terms, Audio-Watermark via SynthID)

## 🔄 Wiederverwendung bestehender Architektur

- **Credit-System**: Identisch zu allen Providern (`credit-reserve` → `credit-commit/refund`)
- **Storage**: `ai-video-generations` Bucket mit User-ID-Prefix (RLS-konform)
- **History**: `ai_video_generations` Tabelle — kein Schema-Change nötig (Veo-Videos sind reguläre Generations mit `provider='veo-3.1-lite'`)
- **Webhook-Pattern**: Spiegelt `sora-scene-webhook` mit Video-Download + Storage-Upload

## ⚠️ Risiken & Mitigations

1. **Replicate Rate-Limits**: Veo 3.1 ist noch Beta auf Replicate → Retry-Logik mit 60s Backoff bei 429 (wie in `generate-sora-scenes-batch`)
2. **Audio-Qualität-Erwartung**: Klare UI-Disclaimer „Audio-Generierung experimentell — nicht für finalen Broadcast geeignet"
3. **Kosten**: Veo ist teurer als Wan (€0.40/s vs. €0.10/s) → klare Cost-Anzeige im Generator vor Submit

## 📋 Test-Plan

- Deploy `generate-veo-video` + `veo-video-webhook` via `supabase--deploy_edge_functions`
- Test über `supabase--curl_edge_functions` mit Mock-Prompt
- Manueller End-to-End-Test im Frontend: `/veo-video-studio` → 4s Video mit Audio → Verify in History + Wallet-Abzug

## 🚀 Ergebnis

Mit dieser Integration sind wir **der einzige Anbieter** der **Veo 3.1 Lite + 6 weitere Modelle + vollständigen Post-Production-Stack** vereint. Artlist hat 1 Modell + Generation. **Wir haben 7 Modelle + komplettes Studio.**
