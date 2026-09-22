# KI-Videomodelle auf Kostenneutralität (Break-even) umstellen

Ziel: Mit jedem Videomodell weder Gewinn noch Verlust — nach Mehrwertsteuer, Zahlungsgebühren und selbst mit Founder-Rabatt.

## Die Rechnung

Was von einem Verkaufspreis wirklich bei uns ankommt:

```text
Bruttopreis
  − 19 % MwSt. (in unseren Preisen enthalten)   ÷ 1,19
  − ca. 10 % Zahlungsgebühren                   × 0,90
  − 10 % Founder-Rabatt                         × 0,90
  = muss die Providerkosten + 3 % Puffer decken
```

Daraus folgt ein einheitlicher Faktor:

**Verkaufspreis = Providerkosten × 1,513**

(heute liegen die meisten Modelle bei ca. 2,2× — die Preise sinken also im Schnitt um rund 30 %.)

Beispiele:

| Modell | Providerkosten €/s | heute €/s | neu €/s |
| --- | --- | --- | --- |
| Hailuo 2.3 Std | 0,045 | 0,10 | 0,068 |
| Kling 3.0 | 0,060 | 0,135 | 0,091 |
| Seedance 2.5 720p | 0,217 | 0,3333 | 0,328 |
| Veo 3.1 Fast | 0,40 | 0,86 | 0,605 |
| Veo 3.1 Pro | 1,10 | 2,365 | 1,664 |

Alle Preise werden kundenfreundlich auf 4 Nachkommastellen gerundet (wie heute), USD wird weiterhin automatisch aus EUR abgeleitet.

## Was umgesetzt wird

1. **Ein Preis-Generator statt Handzahlen.** Im Preiskatalog (Backend und Client-Spiegel) werden die Verkaufspreise künftig aus den Providerkosten berechnet, nicht mehr einzeln gepflegt. Damit kann kein Modell mehr aus der Reihe fallen.
2. **Alle Modell-Anzeigedateien angleichen**, damit im Studio exakt der Preis steht, der auch abgebucht wird (Hailuo, HappyHorse, Seedance, Kling, Wan, Luma, LTX, Vidu, Pika, Runway, Veo, Sora, Grok).
3. **Regel-Test umstellen:** Der bisherige Test „mindestens 1,75× Marge" wird ersetzt durch „Preis = Break-even-Faktor (± Rundung)". Die bisherige Seedance-2.5-Ausnahme entfällt, weil sie dann regulär passt.
4. **Admin-Margenansicht** zeigt danach konsequent ~0 % Nettomarge statt einer veralteten 42-%-Warnschwelle.
5. **Referenz-Video-Abrechnung (Seedance 2.5)** bleibt unverändert in der Logik — sie rechnet mit dem Katalogpreis und folgt der Senkung automatisch.

Unverändert bleiben: Lip-Sync, Audio/Stimmen, Musik, Picture Studio, Video-Enhance, Guthaben-Pakete, Abos, Rückerstattungen, Routing und Historie.

## Zwei Hinweise vorab

- **Starter-Paket:** 10 € ergeben heute nur 9 Guthaben-Einheiten (−10 %). Bei Break-even-Preisen führt das bei diesem Paket weiterhin zu einem kleinen Minus. Ich lasse das unverändert, solange du nichts anderes sagst.
- **Seedance 2.5 mit Referenzvideo** kostet uns Ausgabe- plus Referenzsekunden; der Break-even hält nur, weil beide Anteile berechnet werden — das bleibt so.

## Technische Details

Betroffen: `supabase/functions/_shared/videoPricingCatalog.ts`, `src/lib/cost/videoPricingCatalog.ts` (abgeleitete `sellEUR` statt Handwert, neuer Export `BREAK_EVEN_FACTOR`), `src/lib/cost/fx.ts` (Margenfloor → Break-even-Konstanten: VAT 1,19, Netto 0,90, Rabatt 0,90, Puffer 1,03), `src/config/*VideoCredits.ts` + `src/config/aiVideoModelRegistry.ts`, `src/lib/cost/videoProviderMargins.ts` (`MARGIN_FLOOR`), `src/test/pricing-net-margin.test.ts` (neu: Break-even-Test), Parity-Tests laufen unverändert weiter. `CATALOG_VERSION` wird hochgezogen. Keine Änderung an Abbuchungs-, Wallet- oder Refund-Logik.
