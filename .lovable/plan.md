
# Preis-Refactor — Alle AI-Video-Modelle auf exakt 3,00× Marge

**Scope:** Nur die 29 direkten Video-Provider aus `videoProviderMargins.ts`.
**Nicht angefasst:** Lip-Sync (Sync.so), Bild-Modelle (Picture Studio), ElevenLabs (TTS/Music/SFX), HeyGen — bleiben wie sie sind.
**Kosten-Basis:** Wie besprochen die dokumentierten Juni-2026-Werte aus `videoProviderMargins.ts` (nicht heute live verifiziert — akzeptierte Ungenauigkeit).

## Neue Preistabelle (Sell = Cost × 3, auf ganze Cent gerundet)

Legende: ↓ = günstiger, ↑ = teurer, = unverändert. Δ% zum bisherigen Sell-Preis.

### Standard-Tier

| Modell | Cost € | Alt-Sell € | **Neu-Sell €** | Δ% |
|---|---|---|---|---|
| Hailuo 2.3 Std 768p | 0,045 | 0,15 | **0,14** | ↓ −6,7 % |
| Hailuo 2.3 Pro 1080p | 0,075 | 0,22 | **0,23** | ↑ +4,5 % |
| HappyHorse 720p | 0,14 | 0,40 | **0,42** | ↑ +5,0 % |
| HappyHorse Pro 1080p | 0,28 | 0,80 | **0,84** | ↑ +5,0 % |
| Seedance 2.0 Std | 0,03 | 0,15 | **0,09** | ↓ **−40,0 %** |
| Seedance 2.0 Pro | 0,06 | 0,20 | **0,18** | ↓ −10,0 % |
| **Seedance 2.0 Mini (neu)** | ~0,02 | — | **0,06** | neu |
| Kling 3 Std 720p | 0,06 | 0,18 | **0,18** | = |
| Kling 3 Pro 1080p | 0,10 | 0,28 | **0,30** | ↑ +7,1 % |
| Wan 2.5 Std | 0,04 | 0,12 | **0,12** | = |
| Wan 2.5 Pro | 0,07 | 0,20 | **0,21** | ↑ +5,0 % |
| Wan 2.6 Std | 0,04 | 0,12 | **0,12** | = |
| Wan 2.6 Pro | 0,07 | 0,20 | **0,21** | ↑ +5,0 % |
| Luma Ray 2 Std | 0,07 | 0,20 | **0,21** | ↑ +5,0 % |
| Luma Ray 2 Pro | 0,12 | 0,35 | **0,36** | ↑ +2,9 % |
| LTX 2.0 Std | 0,02 | 0,08 | **0,06** | ↓ −25,0 % |
| LTX 2.0 Pro | 0,04 | 0,12 | **0,12** | = |
| Vidu Q2 Reference (5s) | 0,22 | 0,65 | **0,66** | ↑ +1,5 % |
| Vidu Q2 I2V (5s) | 0,20 | 0,55 | **0,60** | ↑ +9,1 % |
| Vidu Q2 T2V (5s) | 0,20 | 0,55 | **0,60** | ↑ +9,1 % |
| Pika 2.2 Std | 0,04 | 0,14 | **0,12** | ↓ −14,3 % |
| Pika 2.2 Pro | 0,09 | 0,26 | **0,27** | ↑ +3,8 % |
| Runway Gen-4 Aleph | 0,08 | 0,23 | **0,24** | ↑ +4,3 % |

### Premium-Engine-Tier

| Modell | Cost € | Alt-Sell € | **Neu-Sell €** | Δ% |
|---|---|---|---|---|
| Veo 3.1 Lite 720p | 0,15 | 0,42 | **0,45** | ↑ +7,1 % |
| Veo 3.1 Lite 1080p | 0,22 | 0,62 | **0,66** | ↑ +6,5 % |
| Veo 3.1 Fast 1080p | 0,40 | 1,15 | **1,20** | ↑ +4,3 % |
| Veo 3.1 Pro 1080p | 1,10 | 3,15 | **3,30** | ↑ +4,8 % |
| Sora 2 Standard | 0,20 | 0,55 | **0,60** | ↑ +9,1 % |
| Sora 2 Pro | 0,45 | 1,30 | **1,35** | ↑ +3,8 % |
| Grok Imagine | 0,15 | 0,42 | **0,45** | ↑ +7,1 % |

**Zusammenfassung Kunden-Impact:**
- 4 Modelle **günstiger** (Seedance Std -40 %, LTX Std -25 %, Pika Std -14 %, Hailuo Std -7 %)
- 4 Modelle **unverändert** (Kling Std, Wan 2.5/2.6 Std, LTX Pro)
- 21 Modelle **leicht teurer** (durchschnittlich +5 %)
- 1 Modell **neu** (Seedance Mini)

Founders-20 %-Coupon läuft weiter on-top — für Gründer wird der reale Zahlpreis ~2,4× Kosten (immer noch positiv).

---

## Datei-Änderungen

### 1. Margin-Single-Source-of-Truth
- `src/lib/cost/videoProviderMargins.ts`
  - Alle 29 `sellEUR`-Werte auf die neuen Zahlen aktualisieren
  - Neuen Eintrag `seedance-mini` hinzufügen
  - Kommentar-Header: *"All models normalized to 3.00× cost margin — 14.07.2026"*
  - `MARGIN_FLOOR` von `0.60` auf `0.66` (= 2,94×) heben, damit QA-Warnungen bei Drift greifen

### 2. Provider-Credit-Configs (Kunde zahlt hier)
Alle Sell-Preise 1:1 synchronisieren:
- `src/config/hailuoVideoCredits.ts`
- `src/config/happyhorseVideoCredits.ts`
- `src/config/seedanceVideoCredits.ts` *(inkl. neuer Mini-Entry)*
- `src/config/klingVideoCredits.ts`
- `src/config/wanVideoCredits.ts`
- `src/config/lumaVideoCredits.ts`
- `src/config/ltxVideoCredits.ts`
- `src/config/viduVideoCredits.ts`
- `src/config/veoVideoCredits.ts`
- `src/config/aiVideoCredits.ts` *(Sora)*
- `src/config/grokVideoCredits.ts`
- `src/config/aiVideoModelRegistry.ts` *(costPerSecond-Map pro Modell + Seedance-Mini-Registry)*

Pika + Runway haben keine dedizierte Config-Datei; ihre Preise leben in den Edge-Functions `generate-pika-video` und `generate-runway-video` — dort synchronisieren.

### 3. Seedance 2.0 Mini End-to-End einbauen
- Registry-Entry mit `id: seedance-mini`, 720p, 3–12s, `costPerSecond: 0.02`, sell `0.06`
- `supabase/functions/generate-seedance-video/index.ts`: neuer Zweig für `body.model === 'seedance-mini'` → Replicate-Slug `bytedance/seedance-2-mini` (Slug beim ersten Live-Call verifizieren)
- Credit-Guardrail in `ai-video-purchase-credits` erweitern

### 4. QA + Admin-Cockpit
- Admin → Cost Monitor → "Video-Provider Live-Marge" zeigt danach ~29× **3,00×** — perfekte einheitliche Zeile
- Blended-Margin-KPI wird von ~66,6 % auf exakt **66,7 %** stabilisiert

## Nicht Teil dieses Plans

- Sync.so / HeyGen / ElevenLabs / Picture Studio Preise → **unangetastet**
- Kein Live-Verify der Kosten (bewusst akzeptiert — Basis bleibt Juni-2026-Schätzung)
- Keine Änderung am Founders-Coupon oder Beta-14,99 €-Abo
- Keine Änderung an der Pricing-Marketing-Page (Beta-Basic-Preis unverändert)

## Risiken / Hinweise

- **Seedance Std −40 %** ist der größte Ausreißer nach unten. Wer den Preis im Kopf hatte, sieht plötzlich einen sehr günstigen Anker — kann Referenzeffekt auf teurere Modelle haben. Alternative: Seedance-Std-Cost von 0,03 auf 0,04 anheben (falls Replicate zwischenzeitlich gestiegen ist) → wäre 0,12 sell. Sag Bescheid falls du das prüfen willst.
- **LTX Std −25 %** ähnlich, aber kleineres Volumen.
- Bestehende in-Flight-Käufe/Wallets sind nicht betroffen (Preise werden nur auf neue Renders angewandt).

## Nach Approve

Ich mache das in **einer Runde** — 12 Files, keine Migrationen, kein Schema-Change. Danach kurzer Sanity-Check über den Cost-Monitor-Screen, dann bist du start-ready.
