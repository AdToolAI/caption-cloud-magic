# Preis-Konsistenz UI ↔ Abbuchung

## Was der User meint
Die im Studio angezeigten Sekundenpreise (z. B. Seedance Mini `0,06 €/s → 12s = 0,72 €`) stimmen nicht immer mit dem tatsächlich abgebuchten Betrag überein (`1,80 €` in der letzten Generation). Auch wenn die Abbuchung "korrekt" wirken mag — die Diskrepanz zwischen Ansage und Beleg ist für Kunden das Problem.

## Root Cause
Wir haben **zwei getrennte Preistabellen**:

1. **Frontend** — `src/config/{seedance,kling,wan,…}VideoCredits.ts` → wird für die Preis-Anzeige (`ModelSelector`, `ToolkitGenerator`) genutzt.
2. **Backend** — `MODEL_PRICING` konstante in jeder Edge Function (`generate-seedance-video`, `generate-kling-video`, …) → wird für die tatsächliche Abbuchung genutzt.

Wenn die beiden auseinanderlaufen (z. B. weil ein Deploy hängengeblieben ist, wie bei Seedance Mini geschehen: FE `0.06`, Edge Function noch alt mit `0.15`), sieht der Kunde eine falsche Ansage.

Zusätzlich: In `ai_video_generations.cost_per_second` speichern wir zwar den tatsächlich verrechneten Preis, aber die UI-History (`VideoGenerationHistory`) zeigt bereits `total_cost_euros` aus DB — das ist schon korrekt. Das Problem sitzt **vor** der Generierung, im Kosten-Preview.

## Fix in 3 Schritten

### 1. Ein kanonischer Preis-Katalog `supabase/functions/_shared/videoPricingCatalog.ts`
- Enthält für jedes Modell: `{ id, replicateCostEUR, sellEUR, minDuration, maxDuration }`.
- Wird von **allen** Edge Functions importiert (`generate-*-video`) statt eigener `MODEL_PRICING`.
- Wird durch einen simplen `pricing-catalog` GET-Edge-Function nach außen exponiert (kein Auth nötig, cache-fähig).

### 2. Frontend zieht Preise live vom Server
- Neuer Hook `useVideoPricingCatalog()` (React Query, `staleTime: 5min`) holt die kanonische Liste.
- `ModelSelector`, `ToolkitGenerator`, `CostComparisonWidget` nutzen den Hook statt statischer `costPerSecond`-Werte.
- Fallback: Wenn Fetch fehlschlägt, greifen die client-configs (`src/config/*Credits`) als Notreserve.

### 3. Abbuchungs-Beleg im UI („Was du bezahlt hast")
- Nach jeder Generierung zeigt die Toast-/Result-Karte den **tatsächlich abgebuchten Betrag** aus `ai_video_generations.total_cost_euros` (nicht mehr die vorab kalkulierte Schätzung).
- `VideoGenerationHistory` zeigt diesen Wert bereits — Toast-Meldungen (`useSeedanceGeneration`, `useVeoGeneration`, …) ergänzen um die Formulierung: „Abgebucht: 0,72 € (12s × 0,06 €/s)".

### 4. Migration der bestehenden Edge Functions
Alle 11 `generate-*-video` Funktionen umstellen auf den Shared-Katalog:
`generate-seedance-video`, `generate-kling-video`, `generate-wan-video`, `generate-luma-video`, `generate-hailuo-video`, `generate-happyhorse-video`, `generate-ltx-video`, `generate-veo-video`, `generate-grok-video`, `generate-vidu-video`, `generate-runway-video`, `generate-pika-video`.

## Nicht im Scope
- Neue Provider/Modelle.
- UI-Redesign der Kosten-Karten (nur Datenquelle wird umgestellt).
- Change der 3,00×-Marge — Preise bleiben identisch, nur ihre Quelle wird vereinheitlicht.

## Nebeneffekt (positiv)
Der Seedance-Mini-Bug (stale-Deploy → 0,15 €/s statt 0,06 €/s) kann sich strukturell nicht mehr wiederholen: Ein Preis-Update in `videoPricingCatalog.ts` wirkt gleichzeitig auf FE-Anzeige und BE-Abbuchung, weil beide dieselbe Quelle ziehen.

## Refund-Empfehlung
Für die aktuelle Seedance-Generation von `bestofproducts4u@gmail.com` (`4e6cbb81…`, 1,80 € statt 0,72 €) im gleichen Zug 1,08 € Video-Credit-Refund gutschreiben und im `ai_video_transactions` mit Grund `pricing_desync_refund` protokollieren.
