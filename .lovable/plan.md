## Music Studio Pricing — Minimal-Anpassung (nur Stable Audio + ElevenLabs)

Bestehende Marge bei **MiniMax Music 1.5 (0.30 €)** und **Google Lyria 3 Pro (0.42 €)** bleibt unverändert — beide sind komfortabel profitabel (~10× bzw. ~5.7×).

Angepasst werden nur die zwei defizitären Engines:

| Engine | Preis alt | Kosten worst-case | **Preis neu** | Marge neu | Modell |
|---|---|---|---|---|---|
| Stable Audio 2.5 | 0.15 € (Verlust) | ~0.184 €/Track | **0.55 €** flat | ~3.0× | flat / Track |
| ElevenLabs Music v2 | 0.36 € flat (Verlust) | ~0.0076 €/s | **0.023 €/s** | ~3.0× | **per-second** |
| MiniMax 1.5 | 0.30 € | 0.028 € | **0.30 €** (unverändert) | ~10.7× | flat |
| Lyria 3 Pro | 0.42 € | 0.074 € | **0.42 €** (unverändert) | ~5.7× | flat |

ElevenLabs muss zwingend auf per-second wechseln, weil Replicate genau so abrechnet (60 s ≈ 1.38 €, 300 s ≈ 6.90 €) — bei Flatprice wäre jeder 5-Min-Song ein 6-€-Verlust.

## Änderungen

1. **`src/lib/music/engineCatalog.ts`**
   - Neues Feld `pricingModel: 'flat' | 'per-second'` (default `flat`).
   - Neues Feld `priceEurPerSecond` (optional, nur ElevenLabs).
   - `stable-audio-25.priceEur`: `0.15` → **`0.55`**.
   - `elevenlabs-music-v2`: `pricingModel: 'per-second'`, `priceEurPerSecond: 0.023`, `priceEur` bleibt als „Referenz @ 60 s" = `1.38`.
   - MiniMax + Lyria: unverändert.

2. **`src/hooks/useMusicGeneration.ts` / `MUSIC_TIER_PRICING`**
   - Helper `computeMusicPrice(engine, durationSec)`: `per-second → priceEurPerSecond × duration`, sonst `priceEur`.
   - Preisberechnung im UI-State über diesen Helper.

3. **`src/components/music-studio/ProviderSelector.tsx`**
   - Badge dynamisch:
     - flat → `€X.XX • ≤Ys` (wie heute)
     - per-second → `€0.023/s • ≤300s`
   - Nur ElevenLabs-Karte bekommt die Variante.

4. **`src/pages/MusicStudio.tsx`**
   - Live-Kostenpreview an der Duration/Lyrics-Steuerung: „Kosten dieser Generierung: ~X.XX €".

5. **`supabase/functions/generate-music-track/index.ts`**
   - Abbuchung analog Helper: `charge = pricingModel === 'per-second' ? priceEurPerSecond × requestedSeconds : priceEur`.
   - Idempotenter Refund-Pfad bleibt unverändert; `charge` wandert 1:1 durch Wallet-Transaktion.

## Nicht enthalten

- Keine Änderungen an MiniMax- oder Lyria-Preisen.
- Keine Änderungen an anderen Studios, am Video-Katalog oder an History-Einträgen (Alt-Runs behalten ihren damals gebuchten Preis).
- Kein UI-Rebrand — nur Preis- und Anzeigelogik.

Wenn okay, setze ich exakt so um.