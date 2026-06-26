
# Marge-Anhebung — NUR direkte AI-Video-Provider (60–70%)

## Scope
**Nur die 11 Video-Provider.** Lipsync (Sync.so), HeyGen Talking-Head, ElevenLabs Audio, Music-Studio und Picture-Studio bleiben **unverändert** — keine Preis-, keine Pipeline-Änderungen.

## Ist vs. Neu

| Provider | Alt €/s | Echtkost €/s | **Neu €/s** | Marge |
|---|---|---|---|---|
| Hailuo 2.3 Std 768p | 0.15 | 0.045 | **0.15** ✓ | 70% |
| Hailuo 2.3 Pro 1080p | 0.20 | 0.075 | **0.22** | 66% |
| HappyHorse 720p | 0.28 | 0.14 | **0.40** | 65% |
| HappyHorse Pro 1080p | 0.56 | 0.28 | **0.80** | 65% |
| Seedance Std 720p | 0.15 | 0.03 | **0.15** ✓ | 80% |
| Seedance Pro 1080p | 0.20 | 0.06 | **0.20** ✓ | 70% |
| Kling 3 Std 720p | 0.15 | 0.06 | **0.18** | 67% |
| Kling 3 Pro 1080p | 0.20 | 0.10 | **0.28** | 64% |
| Wan 2.5/2.6 Std | 0.10 | 0.04 | **0.12** | 67% |
| Wan 2.5/2.6 Pro | 0.15 | 0.07 | **0.20** | 65% |
| Luma Ray 2 Std | 0.18 | 0.07 | **0.20** | 65% |
| Luma Ray 2 Pro | 0.25 | 0.12 | **0.35** | 66% |
| LTX 2 Std | 0.08 | 0.02 | **0.08** ✓ | 75% |
| LTX 2 Pro | 0.12 | 0.04 | **0.12** ✓ | 67% |
| **Veo 3.1 Lite 720p** | 0.20 | 0.15 | **0.42** | 64% |
| **Veo 3.1 Lite 1080p** | 0.30 | 0.22 | **0.62** | 65% |
| **Veo 3.1 Fast 1080p** | 0.55 | 0.40 | **1.15** | 65% |
| **Veo 3.1 Pro 1080p** | 1.40 | 1.10 | **3.15** | 65% |
| **Sora 2 Std** | 0.25 | 0.20 | **0.55** | 64% |
| **Sora 2 Pro** | 0.53 | 0.45 | **1.30** | 65% |
| **Grok Imagine** | 0.20 | 0.15 | **0.42** | 64% |
| Vidu Q2 (flat 5s) | ~0.40 | ~0.20 | **0.58** | 66% |
| Runway Gen-4 Aleph | derzeit ~30% | hoch | **+50% Markup** | ~60% |
| Pika 2.2 (Maint.) | — | — | bei Reaktivierung **+40%** | 65% |

Premium-Engines (Sora/Veo/Grok) erhalten den größten Sprung (~2–2.5x) — dort ist die Marge heute am schlechtesten.

## Strategie für Premium-Schock
- **Beta-Disclaimer** im Provider-Picker: „Premium-Engine — echte Provider-Kosten. Founder-Tier bekommt 30% Rabatt bis 31.12.2026"
- Hailuo / HappyHorse / Seedance bleiben weiterhin als „günstig & profitabel" Default-Empfehlung sichtbar.

## Files
1. `src/config/aiVideoCredits.ts` — Sora 2
2. `src/config/veoVideoCredits.ts` — alle 4 Stufen
3. `src/config/grokVideoCredits.ts`
4. `src/config/hailuoVideoCredits.ts` — Pro
5. `src/config/happyhorseVideoCredits.ts`
6. `src/config/klingVideoCredits.ts`
7. `src/config/wanVideoCredits.ts` (beide Versionen 2.5 + 2.6)
8. `src/config/lumaVideoCredits.ts`
9. `src/config/ltxVideoCredits.ts` — bleibt (nur Doku-Kommentar)
10. `src/config/viduVideoCredits.ts` — flatCosts
11. `src/config/seedanceVideoCredits.ts` — bleibt
12. Runway- + Pika-Markup in deren jeweiligen Configs
13. **NEU** `src/lib/cost/videoProviderMargins.ts` — zentrale Map `{provider → {sellPrice, replicateCost, margin}}` für Admin-Cockpit
14. `src/pages/admin/CostMonitor.tsx` — neue Karte „Video-Provider Live-Marge" mit <60%-Warn-Badge
15. Provider-Picker im Toolkit + Composer: Disclaimer-Badge bei Sora/Veo/Grok
16. Description-Strings in den Configs nachziehen (z.B. „ab 1,32€ pro 6 Sek")

## Was NICHT angefasst wird
- Lipsync (`lipsync-engine`, `compose-dialog-scene`, `compose-twoshot-audio`, Sync.so Pricing)
- HeyGen Talking-Head Pricing
- ElevenLabs TTS/STT Pricing
- Music-Studio Pricing
- Picture-Studio Pricing
- Credit-Pack-Bonus (separater Plan)
- Beta-Founder-Preis €14.95 (separates Marketing)

### User-Aktion
Keine. Alles läuft über das Credit-Wallet → neue `costPerSecond` greift sofort. Keine Stripe-Änderung.

## Erwarteter Effekt
- **Video-Blended-Margin**: ~42% → **~66%**
- Größter Hebel: Sora/Veo/Grok (von 15–27% auf 64–65%)
- Lipsync-Marge bleibt wie heute (22%) — wie gewünscht unangetastet

## Bereit zum Bauen?
Geschätzte Dauer: 1 Build-Iteration über die 11 Config-Files + Admin-Karte + Disclaimer-Badge. Sag „go" und ich setze es um.
