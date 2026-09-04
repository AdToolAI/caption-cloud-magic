# Topaz & Clarity scharfschalten + degressive Margen-Engine

## Kurze Antwort auf deine Frage

Nein, noch nicht einsatzbereit. Die Oberfläche ist fertig (Upscale · Restaurieren · Kolorieren, echte Modellnamen, alle Regler, Preisvorschau, Vorher/Nachher, Vergleich), aber:

- Die neue Verbesserungs-Funktion im Backend ist geschrieben und noch nicht ausgerollt.
- Clarity Pro läuft im Studio weiterhin über den alten Weg (0,03 € / 0,06 €).
- Alle drei Topaz-Modelle sind gesperrt ("bald verfügbar"), vorne und im Backend, bis echte Testläufe und deine Preisfreigabe vorliegen.

## Degressive Margen-Engine (ersetzt die starre 1,75×-Regel)

Preisformel pro Lauf — Mindestdeckungsbeitrag korrekt **vor** dem Payment-Abzug hochgerechnet:

```text
Endpreis = ceilCent( max(
    MIN_PRICE,
    (providerCost + MIN_CONTRIBUTION) / NET_FACTOR,
    providerCost × multiplier(providerCost)
) )
```

mit `NET_FACTOR = 0.90`, `MIN_CONTRIBUTION = 0.02 €`, `MIN_PRICE = 0.03 €`.

Multiplikator-Stützpunkte (linear interpoliert, eindeutig bis über 5 €):

| Providerkosten | Multiplikator |
| --- | --- |
| 0,00 € | 3,00 |
| 0,05 € | 3,00 |
| 0,30 € | 2,70 |
| 1,00 € | 2,30 |
| 3,00 € | 2,00 |
| 5,00 € | 1,80 |
| > 5,00 € | 1,80 (konstant) |

Margen-Kennzahlen immer auf Nettoumsatz:

```text
Net Revenue    = Endpreis × 0.90
Contribution € = Net Revenue − Provider Cost
Gross Margin % = Contribution / Net Revenue
```

Ziel: 55–65 % Bruttomarge nach Providerkosten — das ist der KPI, nicht der Multiplikator.

## Wechselkurs-Schutz

Providerkosten werden zentral in USD geführt und abgesichert umgerechnet, bevor die Margen-Engine greift:

```text
providerCostEur = providerCostUsd × fxRate × (1 + fxSafetyBuffer)
```

`fxSafetyBuffer` startet bei 3 %; `fxRate` liegt als eine gepflegte Konstante zentral (kein Live-Kurs pro Anfrage). Registry führt je Modell `providerCostUsd` statt eines heute umgerechneten Eurobetrags.

## Clarity-Bestandsschutz als sichtbare Ausnahme

0,03 € / 0,06 € bleiben. Im Preisreport werden sie als `Pricing mode: Legacy Fixed Price` markiert und trotzdem mit Provider Cost, User Price, Net Revenue, Contribution € und Effective Margin % ausgewiesen — so fällt sofort auf, wenn der Festpreis durch Kostenänderungen unwirtschaftlich wird.

## Server entscheidet, Client zeigt nur an

```text
Client-Schätzung → Enhance-Anfrage → Server berechnet den verbindlichen Preis
→ Credits reserviert → Replicate-Aufruf
```

Ein vom Browser gesendeter Preis wird nie zur Grundlage der Abbuchung. Client und Server laufen in Tests durch dieselben Fixtures (Providerkosten 0,01 / 0,05 / 0,10 / 0,30 / 0,50 / 1 / 3 / 5 €) und müssen exakt dieselben Endpreise liefern.

## Freischaltung dreistufig

- Frontend-Registry-Flag (`picture.enhance.topaz_*`) — nur Sichtbarkeit.
- Backend-Schalter (`PICTURE_TOPAZ_*_ENABLED`) — maßgeblich; ohne ihn startet kein Lauf, auch bei manipuliertem Frontend.
- Test-Allowlist (`PICTURE_ENHANCE_TEST_USER_IDS`) — dein Konto kann echte Läufe ausführen, während das Feature global aus bleibt.

## Reihenfolge

1. Margen-Engine bauen (Kurve, Floor-Formel, FX-Puffer, Net-Revenue-Kennzahlen) plus geteilte Fixture-Tests Client/Server.
2. `enhance-image` ausrollen; Clarity darüber laufen lassen, Preise unverändert. `upscale-image` bleibt aktiv.
3. Voller E2E-Erfolgspfad: Run angelegt → Preis serverseitig → Credits reserviert → Replicate ok → Asset persistiert → in der Mediathek sichtbar → Download → korrekter Run-Status.
4. Fehlerpfad testen: Provider-Fehler → genau eine Erstattung, kein Doppelrefund bei Retry oder Webhook.
5. Erst danach `upscale-image` ablösen und `ImageCard`/`StudioLightbox` umstellen.
6. Topaz Upscale nur über die Allowlist: je ein günstigster echter Testlauf (2×, Gesichts-Verbesserung an/aus); danach Dust & Scratch und Colorization mit je einem Testbild.
7. Preisreport für dich: Provider Cost (USD/EUR), Dauer, Qualitätseindruck, Endpreis aus der Kurve, Net Revenue, Contribution, Marge — mit Vorschlag.
8. Nach deiner Freigabe: Topaz global aktivieren, danach "Topaz vs. Clarity vergleichen".

## Technische Details

- Neue Datei `src/lib/pictureModels/marginCurve.ts` (Stützpunkte, Interpolation, Floor-Formel, FX-Umrechnung); `estimatePrice` liefert zusätzlich `multiplierUsed`, `netRevenueEUR`, `contributionEUR`, `marginPct`, `pricingMode: 'curve' | 'legacy_fixed'`.
- Server-Spiegel in `supabase/functions/_shared/picture-enhance-models.ts` nutzt exakt dieselbe Kurve und Formel; ein Test vergleicht beide Implementierungen über die Fixture-Liste.
- Registry-Preisfelder auf `providerCostUsd` umstellen, EUR nur abgeleitet.
- Testläufe kosten echtes Guthaben (kleinstmögliche Bilder, 2×); keine Kundenkonten betroffen.
- Aufgabe wird zu Beginn der Umsetzung in `roadmap.md` eingetragen.
