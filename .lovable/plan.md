# Preis-Audit: 3× Marge wirklich überall durchsetzen

## Kurzantwort auf die Frage

Nein — die 3×-Regel gilt aktuell nur sauber im **Preiskatalog** (`videoPricingCatalog.ts`), den das AI Video Studio nutzt. Der **Video-Composer-Rail** und die **Admin-Margen-Tabelle** laufen auf eigenen, veralteten Kostentabellen. Dort gibt es echte Abweichungen in beide Richtungen.

## Verifizierte Abweichungen (heute im Code)

Katalog (Soll, 3.00×) vs. `supabase/functions/_shared/clip-costs.ts` + `src/types/video-composer.ts` (Composer-Ist):

| Modell | Katalog (Soll) | Composer (Ist) | Effekt |
| --- | --- | --- | --- |
| LTX 2.3 Fast / Pro | 0,18 / 0,24 €/s | 0,06 / 0,12 €/s | **Marge ~1×–1,5× → wir zahlen drauf** |
| Grok Imagine | 0,15 €/s | 0,45 €/s (nur serverseitig) | 9× → Nutzer wird überteuert belastet |
| Seedance Std / Pro | 0,45 / 0,54 €/s | 0,09 / 0,18 €/s | **deutlich unter Kosten** |
| Kling (pro) | 0,18 (K3) / 0,12 (K2.6) €/s | 0,30 €/s | inkonsistent |

Weitere Lücken:
- `clip-costs.ts` (Server, auch für **Refunds**) kennt `ai-seedance25` gar nicht → Fallback 0,15 €/s statt 0,663 €/s.
- `clip-costs.ts` fehlt Grok-Korrektur, Wan 2.6/2.7 und Luma Ray 3.2.
- `src/lib/cost/videoProviderMargins.ts` (Admin-Cost-Monitor) führt LTX noch als „LTX 2.0" mit 0,06/0,12 und hat weder Kling 2.5/2.6/Omni noch Seedance 2.5 → die Margen-Anzeige im Admin ist falsch.
- Vidu-Labels sind gemischt („Q2"/„Q3").

Nicht betroffen (bewusst eigene Rails, keine 3×-Regel): Lip-Sync (Sync.so), ElevenLabs-Audio, Music, Picture Studio.

## Was gemacht wird

### 1. Ein Katalog, keine Parallel-Tabellen
`videoPricingCatalog.ts` bleibt die einzige Wahrheit. `clip-costs.ts` wird zu einem dünnen Mapper: Composer-Quelle + Qualität (`ai-ltx`/`pro` …) → Katalog-ID → `resolveCostPerSecond()`. Keine eigenen Zahlen mehr im Composer-Server-Code — damit stimmen Abbuchung **und** Refund automatisch.

### 2. Client-Spiegel angleichen
`CLIP_SOURCE_COSTS` in `src/types/video-composer.ts` wird aus derselben Mapping-Tabelle generiert (identische Katalogwerte, im Client als Konstante gespiegelt), inkl. `ai-seedance25`, `ai-grok`, Wan 2.6/2.7, Luma Ray 3.2.

### 3. Admin-Margen-Tabelle neu aufbauen
`videoProviderMargins.ts` wird aus dem Katalog abgeleitet (sell/cost/margin), statt Werte doppelt zu pflegen. Premium-Engine-Tier bleibt als separate Kennzeichnungsliste.

### 4. Test, der Drift künftig blockiert
Ergänzung zu `src/config/__tests__/`:
- jeder Katalog-Eintrag: `sellEUR / costEUR` liegt zwischen 2,95× und 3,10× (Seedance 2.5 mit 3,06× dokumentiert erlaubt),
- jede Composer-Quelle/Qualität hat eine Katalog-ID und identischen Preis,
- jedes Modell in der Registry hat einen Katalog-Eintrag und umgekehrt,
- Admin-Margentabelle == Katalog.

## Technische Details

Betroffene Dateien: `supabase/functions/_shared/clip-costs.ts`, `supabase/functions/_shared/videoPricingCatalog.ts` (nur Labels/fehlende IDs), `src/types/video-composer.ts`, `src/lib/cost/videoProviderMargins.ts`, neue Mapping-Datei `src/lib/cost/composerSourceToCatalog.ts` plus Deno-Pendant im `_shared`-Ordner, sowie ein neuer Vitest.

Keine Änderung an Lip-Sync-Kette, Rendering oder Wallet-Logik. Preisänderungen sind reine Korrekturen auf 3×: LTX und Seedance im Composer werden teurer, Grok wird billiger.
