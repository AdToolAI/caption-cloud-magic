# Topaz & Clarity scharfschalten + degressive Margen-Engine

## Kurze Antwort auf deine Frage

Nein, noch nicht einsatzbereit. Die Oberfläche ist fertig (Upscale · Restaurieren · Kolorieren, echte Modellnamen, alle Regler, Preisvorschau, Vorher/Nachher, Vergleich), aber:

- Die neue Verbesserungs-Funktion im Backend ist geschrieben und noch nicht ausgerollt.
- Clarity Pro läuft im Studio weiterhin über den alten Weg (0,03 € / 0,06 €).
- Alle drei Topaz-Modelle sind gesperrt ("bald verfügbar"), vorne und im Backend, bis echte Testläufe und deine Preisfreigabe vorliegen.

## Preis-Architektur

```text
Modell-Konfiguration → Provider Rate Card → Providerkosten USD
→ FX-Kurs → 3 % Sicherheitspuffer → Providerkosten EUR
→ Legacy-Festpreis? ja: fixer Preis / nein: Margen-Kurve
→ Deckungsbeitrags-Floor → Cent-Rundung → Endpreis
→ vollständiger Snapshot am Run gespeichert
```

Der Server ist immer maßgeblich; der Client nutzt dieselbe Logik nur für die Anzeige "Geschätzt 0,XX €".

## Provider Rate Card statt Einzelpreis

Kein `providerCostUsd: 0.12` pro Modell. Jedes Modell beschreibt in der Registry ein Preismodell:

```text
pricing: {
  currency: 'USD',
  type: 'per_output_mp' | 'output_mp_tier' | 'per_run',
  rates: …
}
```

Daraus berechnet ein `providerCostEstimator(config)` die Kosten aus der konkreten Konfiguration (Ausgabe-Megapixel, Skalierung, Größenstufe, Modellvariante, weitere Parameter). Ein neues Bildmodell braucht künftig nur Rate Card + Adapter + Capabilities — kein eigenes Preissystem.

## Margen-Kurve

```text
Endpreis = ceilCent( max(
    MIN_PRICE,
    (providerCostEur + MIN_CONTRIBUTION) / NET_FACTOR,
    providerCostEur × multiplier(providerCostEur)
) )
```

`NET_FACTOR = 0.90`, `MIN_CONTRIBUTION = 0.02 €`, `MIN_PRICE = 0.03 €`. Der Deckungsbeitrag wird bewusst **vor** dem Payment-Abzug hochgerechnet.

Stützpunkte, linear interpoliert, eindeutig bis über 5 €:

| Providerkosten | Multiplikator | echte Marge nach 10 % |
| --- | --- | --- |
| 0,00 € | 3,00 | 63,0 % |
| 0,05 € | 3,00 | 63,0 % |
| 0,30 € | 2,70 | 58,8 % |
| 1,00 € | 2,30 | 51,7 % |
| 3,00 € | 2,00 | 44,4 % |
| 5,00 € | 1,80 | 38,3 % |
| > 5,00 € | 1,80 | 38,3 % |

**Margenziel richtig formuliert:** 55–65 % gelten nur für günstige Picture-Runs. Bei teuren Runs sinkt die Prozentmarge bewusst, während der absolute Deckungsbeitrag steigt. Der Admin-Report führt deshalb beide Kennzahlen gleichrangig: `Contribution €` und `Gross Margin %`, beide auf Nettoumsatz gerechnet:

```text
Net Revenue = Endpreis × 0.90
Contribution € = Net Revenue − Provider Cost
Gross Margin % = Contribution / Net Revenue
```

## Wechselkurs

Zentral gepflegte Konstante `FX_RATE_USD_EUR` plus `FX_SAFETY_BUFFER = 0.03` und `FX_RATE_UPDATED_AT`. Kein Live-Kurs pro Generierung. Der Admin warnt, wenn der Kurs älter als 30 Tage ist.

## Preis-Snapshot pro Run

Jeder Run speichert unveränderlich: `pricingVersion`, `providerPricingVersion`, `providerCostUsdEstimated`, `providerCostEurBuffered`, `fxRateUsed`, `fxSafetyBufferUsed`, `multiplierUsed`, `userPriceEur`, `netRevenueEur`, `contributionEur`, `marginPct`, `pricingMode` (`curve` | `legacy_fixed`). Damit ist jeder alte Preis später exakt erklärbar, auch nach Kurs-, Kosten- oder Kurvenänderung.

## Clarity-Bestandsschutz als sichtbare Ausnahme

0,03 € / 0,06 € bleiben zunächst unverändert — technischer Umbau und Kundenpreisänderung passieren nicht gleichzeitig. Im Preisreport erscheint `pricingMode: legacy_fixed` mit vollständigen Kennzahlen, damit auffällt, wenn der Festpreis unwirtschaftlich wird. Ob Clarity später auf die Kurve wechselt, entscheiden wir separat.

## Freischaltung dreistufig

- Frontend-Registry-Flag (`picture.enhance.topaz_*`) — nur Sichtbarkeit.
- Backend-Schalter (`PICTURE_TOPAZ_*_ENABLED`) — maßgeblich; ohne ihn startet kein Lauf, auch bei manipuliertem Frontend.
- Test-Allowlist (`PICTURE_ENHANCE_TEST_USER_IDS`) — dein Konto testet echte Produktion, während das Feature global aus bleibt.

## Reihenfolge

1. Rate Card + Cost Estimator + Margen-Kurve + FX-Puffer + Snapshot-Felder bauen; geteilte Fixture-Tests Client/Server (Providerkosten 0,01 / 0,05 / 0,10 / 0,30 / 0,50 / 1 / 3 / 5 €) müssen identische Endpreise liefern.
2. `enhance-image` ausrollen, Clarity darüber laufen lassen, Preise unverändert; `upscale-image` bleibt aktiv.
3. **Gate:** zwei bestandene Clarity-E2E-Läufe — (a) Erfolg: Run angelegt → Preis serverseitig → Credits reserviert → Replicate ok → Asset persistiert → Mediathek → Download → korrekter Run-Status; (b) absichtlicher Provider-Fehler → genau eine Erstattung, kein Doppelrefund bei Retry oder Webhook.
4. Erst danach `upscale-image` ablösen und `ImageCard`/`StudioLightbox` umstellen.
5. Topaz-Testläufe nur über die Allowlist, mit standardisiertem Messprotokoll je Lauf: Input (Maße, MP, Dateigröße), Konfiguration (Modell, Submodell, Skalierung, Face Enhancement, Parameter), Provider (echte Kosten, Laufzeit), AdTool (Endpreis, Net Revenue, Contribution, Marge), Output (Auflösung, MP, Dateigröße, subjektive Qualität, Artefakte).
6. Dust & Scratch und Colorization nach demselben Protokoll.
7. Preisreport zur Freigabe → Topaz global aktivieren → "Topaz vs. Clarity vergleichen".

## Technische Details

- Neue Dateien: `src/lib/pictureModels/providerRates.ts` (Rate Cards, Cost Estimator, FX) und `src/lib/pictureModels/marginCurve.ts` (Stützpunkte, Interpolation, Floor-Formel).
- `estimatePrice` liefert den vollständigen Snapshot-Datensatz zurück, nicht nur den Preis.
- Server-Spiegel in `supabase/functions/_shared/picture-enhance-models.ts` nutzt dieselbe Kurve und dieselben Rate Cards; ein Test vergleicht beide über die Fixture-Liste.
- Snapshot-Felder werden am Enhance-Run persistiert (Migration mit GRANTs und RLS über den bestehenden Besitzer-Pfad).
- Testläufe kosten echtes Guthaben (kleinstmögliche Bilder, 2×); keine Kundenkonten betroffen.
- Aufgabe wird zu Beginn der Umsetzung in `roadmap.md` eingetragen.
