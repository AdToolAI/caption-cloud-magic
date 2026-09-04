# Topaz & Clarity scharfschalten + degressive Margen-Engine

## Kurze Antwort auf deine Frage

Nein, noch nicht einsatzbereit. Die Oberfläche ist fertig (Upscale · Restaurieren · Kolorieren, echte Modellnamen, alle Regler, Preisvorschau, Vorher/Nachher, Vergleich), aber:

- Die neue Verbesserungs-Funktion im Backend ist geschrieben und noch nicht ausgerollt.
- Clarity Pro läuft im Studio weiterhin über den alten Weg (0,03 € / 0,06 €) — funktioniert, nutzt die neuen Regler aber noch nicht.
- Alle drei Topaz-Modelle sind absichtlich gesperrt ("bald verfügbar"), vorne und im Backend, bis echte Testläufe und deine Preisfreigabe vorliegen.

## Degressive Margen-Engine (neu, ersetzt die starre 1,75×-Regel)

Preisformel pro Lauf:

```text
Endpreis = max( Mindestpreis, Mindestdeckungsbeitrag + Providerkosten, Providerkosten × Multiplikator(Providerkosten) )
```

Multiplikator sinkt stufenlos mit den Providerkosten:

| Providerkosten pro Lauf | Multiplikator |
| --- | --- |
| bis 0,05 € | 3,0× |
| 0,05 – 0,30 € | 3,0× → 2,7× |
| 0,30 – 1,00 € | 2,7× → 2,3× |
| 1,00 – 3,00 € | 2,3× → 2,0× |
| ab 3,00 € | 1,8× |

Zwischen den Stützpunkten wird linear interpoliert, damit es keine Preissprünge gibt.

Zusätzlich:

- Mindestdeckungsbeitrag 0,02 € pro Lauf (deckt Payment, Storage, Infrastruktur bei sehr billigen Läufen).
- Mindestpreis 0,03 € pro Lauf.
- Payment-Abzug bleibt 10 % (Nettobetrachtung).
- Ziel-Bruttomarge 55–65 % nach Providerkosten wird berechnet und ist die Kennzahl, die im Admin-Preisreport steht — nicht der Multiplikator.
- Ergebnis wird auf volle Cent aufgerundet.

Bestandsschutz: Clarity Pro behält seine Festpreise 0,03 € / 0,06 €. Die Video- und Wallet-Preise bleiben unangetastet; die Degression gilt zunächst nur für Picture Studio.

## Reihenfolge

1. Preis-Engine auf die degressive Kurve umstellen (`estimatePrice`), inklusive Server-Spiegel für die Verbesserungs-Funktion; Tests für Kurve, Mindestbetrag, Marge und unveränderte Clarity-Preise.
2. Backend-Funktion ausrollen und Clarity Pro darüber laufen lassen — Preise bleiben exakt 0,03 € / 0,06 €.
3. Ein echter Clarity-Durchlauf zur Kontrolle: Abbuchung, Ergebnis in der Mediathek, Download, Rückerstattung im Fehlerfall.
4. Topaz Image Upscale nur für dein Konto freischalten und je einen günstigsten echten Testlauf starten (2×, Gesichts-Verbesserung an/aus).
5. Dasselbe für Dust & Scratch (Restaurieren) und Colorization (Kolorieren) mit je einem Testbild.
6. Kurze Tabelle für dich: tatsächliche Anbieterkosten, Dauer, Qualitätseindruck, resultierender Preis aus der Kurve, Bruttomarge — mit meinem Vorschlag.
7. Nach deiner Freigabe: Topaz für alle Kunden freischalten, danach "Topaz vs. Clarity vergleichen" aktivieren.

## Technische Details

- Neue Datei `src/lib/pictureModels/marginCurve.ts`: Stützpunkte, Interpolation, `MIN_CONTRIBUTION_EUR`, `MIN_PRICE_EUR`; `estimatePrice` ruft sie auf und gibt zusätzlich `multiplierUsed` und `marginPct` zurück.
- Server-Spiegel in `supabase/functions/_shared/picture-enhance-models.ts` nutzt dieselbe Kurve, damit Anzeige und Abbuchung nie auseinanderlaufen (ein Test prüft die Gleichheit).
- `enhance-image` deployen; `upscale-image` bleibt bis Schritt 3 bestätigt ist unangetastet und wird erst danach abgelöst.
- `ImageCard`/`StudioLightbox` von `useImageUpscaler` auf `useEnhanceImage` umstellen (gleiche Preise, gleiche Abbuchung).
- Freischaltung zweistufig: Registry-Flags (`picture.enhance.topaz_*`) im Frontend und `PICTURE_TOPAZ_*_ENABLED` im Backend — beide bleiben aus, bis die Preise freigegeben sind.
- Testläufe kosten echtes Guthaben (kleinstmögliche Bilder, 2×), keine Kundenkonten betroffen.
- Aufgabe wird zu Beginn der Umsetzung in `roadmap.md` eingetragen.
