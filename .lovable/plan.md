
# Plan — AI Video Studio Erweiterung: LTX 2.0 Pro, Grok Imagine & Wan 2.6

## Ausgangslage

Unser **AI Video Studio Hub** (`/ai-video-studio`) bietet bereits 7 Provider-Studios:
Kling 3.0, Veo 3.1, Wan 2.5, Hailuo 2.3, Luma Ray 2, Seedance 2.0, Sora 2.

**Was Artlist anbietet, das uns fehlt:**
- **LTX Video 2.0 Pro** (Lightricks) — schneller, günstiger Open-Source-Champion
- **Grok Imagine** (xAI) — viraler "Spicy Mode", neuer Player
- **Wan 2.6** — neuere Variante unseres bestehenden Wan 2.5

Alle drei Modelle sind über **Replicate** verfügbar — das passt nahtlos in unsere bestehende Architektur (Kling, Hailuo, Seedance, Luma, Wan laufen alle über `replicate.run()` in Edge Functions).

## Was gebaut wird

### 1. LTX 2.0 Pro Studio (`/ltx-video-studio`)

Neuer Provider mit eigenem Studio im "James Bond 2028"-Stil — analog zu `WanVideoStudio.tsx`.

- Modell auf Replicate: `lightricks/ltx-video-2-pro`
- 2 Qualitätsstufen: **Standard** (720p) und **Pro** (1080p, längere Clips)
- Dauer: 4s / 6s / 8s
- Modi: Text-to-Video + Image-to-Video
- Aspect Ratios: 16:9, 9:16, 1:1
- Pricing-Range: ~€0.08–0.12/s (LTX ist deutlich günstiger als Sora/Veo)

### 2. Grok Imagine Studio (`/grok-video-studio`)

Eigenes Studio mit Hinweis auf "Bold Mode" (kein expliziter Spicy-Modus — wir bleiben Brand-safe für unsere Compliance, siehe AI Video Hub Legal-Compliance).

- Modell auf Replicate: `x-ai/grok-imagine` (sobald verfügbar; falls Replicate noch keinen Public-Endpoint hat, wird das Studio mit Banner "Bald verfügbar" deployed und der Generate-Button deaktiviert)
- Dauer: 6s / 12s
- Modi: Text-to-Video + Image-to-Video mit nativer Audio-Spur
- Pricing: TBD nach Replicate-Pricing — Platzhalter ~€0.20/s

### 3. Wan 2.6 Upgrade

Bestehendes `WanVideoStudio.tsx` bekommt einen neuen Modell-Toggle:
- **Wan 2.5** (bestehend) — bleibt für Kontinuität
- **Wan 2.6** (neu) — bessere Motion-Konsistenz, gleiche Preise

Die Edge Function `generate-wan-video` wird erweitert, sodass bei `model: 'wan-2-6-standard' | 'wan-2-6-pro'` ein anderer Replicate-Slug verwendet wird.

### 4. Hub-Integration

`src/pages/AIVideoStudio.tsx` wird um die 2 neuen Provider-Cards ergänzt (LTX, Grok). Der Hub zeigt dann **9 Studios** und positioniert sie strategisch:
- Kling 3.0 (Empfohlen) → Veo 3.1 (Native Audio) → **LTX 2.0 Pro (Schnell & günstig)** → Wan 2.6 (Budget) → Hailuo 2.3 → Luma Ray 2 → Seedance 2.0 → **Grok Imagine (Trending)** → Sora 2

### 5. Credits-System

Für LTX und Grok werden zwei neue Pricing-Configs analog zu `wanVideoCredits.ts` angelegt:
- `src/config/ltxVideoCredits.ts`
- `src/config/grokVideoCredits.ts`

Alle Generierungen laufen über das bestehende `ai_video_wallets` System mit automatischem **Credit-Refund bei Lambda/Replicate-Fehlern** (siehe Memory-Regel: Credit Refund Automation).

### 6. Prompt Optimizer

Beide neuen Studios integrieren den bestehenden `VideoPromptOptimizer` (Auto-Übersetzung + cinematische Anreicherung), genau wie alle anderen Studios.

## Technische Details

**Neue Dateien:**
- `src/pages/LTXVideoStudio.tsx` — Studio-Seite
- `src/pages/GrokVideoStudio.tsx` — Studio-Seite
- `src/config/ltxVideoCredits.ts` — Modell-Konfiguration
- `src/config/grokVideoCredits.ts` — Modell-Konfiguration
- `supabase/functions/generate-ltx-video/index.ts` — Edge Function
- `supabase/functions/generate-grok-video/index.ts` — Edge Function

**Bestehende Dateien (Edits):**
- `src/pages/AIVideoStudio.tsx` — 2 neue Provider-Cards
- `src/App.tsx` (oder Router) — 2 neue Routen
- `src/config/wanVideoCredits.ts` — Wan 2.6 Modell-Einträge
- `supabase/functions/generate-wan-video/index.ts` — Wan 2.6 Replicate-Slug-Routing
- `supabase/config.toml` — neue Edge Functions registrieren (Timeout 180s)

**Architektur-Konformität:**
- Verifizierte Wallets, RLS-konform
- Idempotente Credit-Refunds bei Fehlern
- WYSIWYG-Studio-Pattern (Hub → Studio → History)
- Lokalisierung (DE/EN/ES) — Visual-Prompts bleiben EN
- Compliance-Banner aus dem AI Video Hub Legal-System

## Offene Punkte

- **Grok Imagine auf Replicate**: Falls noch kein öffentlicher Endpoint verfügbar ist, wird das Studio mit "Coming Soon"-Banner deployed (analog zu Sora 2 für Non-Grandfathered Users). Sobald Replicate live ist, reicht eine Slug-Änderung in der Edge Function.
- **LTX Pricing**: Final-Preise werden nach Verifikation der Replicate-Cost-Page gesetzt — aktuelle Schätzung basiert auf öffentlichen Benchmarks.

---

**Ergebnis nach Implementierung**: 9 statt 7 Studios im Hub, Wan-Studio mit Versions-Toggle, vollständige Pricing-Configs, alle Studios mit gleichem UX-Standard.
