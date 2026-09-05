# Pricing-Regel: Kundenpreis nie über 3,0× der echten Providerkosten

Video Enhance bleibt bewusst günstig. Der Deckel gilt nicht nur auf der Schätzung, sondern auf den **verifizierten** Providerkosten — notfalls per automatischer Gutschrift.

## Ausgangslage (geprüft)

- Die degressive Kurve existiert bereits geteilt für Picture Studio und Video Enhance: 3,0× bis 0,05 € · 2,7× bei 0,30 € · 2,3× bei 1,00 € · 2,0× bei 3,00 € · 1,8× ab 5,00 €, linear dazwischen.
- Sie wirkt heute nur als Zielwert: Der Preis ist das Maximum aus Kurvenpreis, Mindestbeitrag und Mindestpreis — nach oben ungedeckelt.
- Topaz-Testlauf: geschätzt 1,50 $ (19 Einheiten), real abgerechnet 0,48 $ (6 Einheiten à 0,08 $). Kundenpreis 3,18 € ≈ 6,9× der echten Kosten. Ein Deckel allein auf der Schätzung hätte das nicht verhindert.
- Topaz rechnet real nach Einheiten, nicht pro Ausgabesekunde — die aktuelle Karte rechnet pro Sekunde.

## Verbindliche Preisregel

**Ebene 1 — vor dem Lauf**

Kundenpreis = degressive Kurve auf den FX-gepufferten geschätzten Providerkosten, hart gedeckelt bei 3,0×. Mindestpreis und Mindestbeitrag bleiben; wenn einer davon über den Deckel drücken würde, wird der Lauf als prüfpflichtig markiert statt still teurer verkauft. Einzige Ausnahme: Kleinstläufe, bei denen der Deckel unter dem absoluten Mindestpreis liegt — ausdrücklich als Boden-Ausnahme im Preis-Schnappschuss vermerkt.

**Ebene 2 — nach dem Lauf**

Sobald die echten Providerkosten eindeutig vorliegen: `verifizierter Faktor = Kundenpreis ÷ gepufferte Ist-Kosten`.

- ≤ 3,0× → alles in Ordnung.
- \> 3,0× → Preis-Drift: die Rate Card des Modells geht für neue Produktionsläufe auf `review_required`, **und** der Kunde erhält die Differenz bis 3,0× automatisch als Wallet-Gutschrift.
- Ist-Kosten höher als geschätzt (Faktor unter 1,8×) → **keine** Nachbelastung. AdTool trägt die Abweichung, die Rate Card wird korrigiert.
- Der vorab genehmigte Preis wird nie nachträglich erhöht.
- Kleine Rundungsdifferenzen (wenige Cent bzw. Mini-Prozenttoleranz) lösen keine Gutschrift aus; echte Drifts schon.

## Topaz: Architektur jetzt, Formel später

- Preis-Typ wird jetzt auf `per_unit` umgestellt, Einheitspreis 0,08 $ eingefroren.
- Verifizierte Kosten = tatsächlich abgerechnete Einheiten × eingefrorener Einheitspreis (aus der Provider-Metrik).
- Es wird **keine** Pixel→Einheiten-Formel aus dem einen 6-Einheiten-Lauf abgeleitet. Bis zur Kalibrierung bleibt die Schätzung bewusst konservativ und die Karte als „Kosten unbestätigt" markiert.
- Weitere kurze Messläufe zum Kalibrieren: 1080p/30, 4K/30 (Referenzpunkt vorhanden), 4K/60, optional gleiche Konfiguration mit anderer Dauer.
- Der historische 3,18-€-Lauf bleibt unverändert als Audit-Schnappschuss.

## Sichtbare Kontrolle im Admin

Pro Modell/Konfiguration: Providerkosten, gepufferte Kosten, Kundenpreis, effektiver Faktor und verifizierter Faktor — grün innerhalb 1,8×–3,0×, rot mit „Pricing blocked" darüber. Ausgelöste Gutschriften werden mit Betrag und Lauf-Bezug aufgelistet.

## Tests

- Produktionspreis überschreitet nie 3,0× der gepufferten Schätzkosten.
- Verifizierter Faktor > 3,0 setzt die Rate Card auf Prüfung.
- Nachträglicher Ausgleich senkt die Kundenbelastung auf ≤ 3,0× der gepufferten Ist-Kosten (Gutschrift genau einmal, idempotent).
- Höhere Ist-Kosten lösen nie eine Nachbelastung aus.
- Boden-Ausnahme nur für ausdrücklich erlaubte Kleinstläufe.
- Client/Server-Parität der gesamten Preisrechnung.
- Kein Test nagelt einen konkreten Eurobetrag fest — geprüft wird immer gegen Kurve und Deckel, damit FX-Änderungen die Tests nicht brechen.

## Technische Details

- `src/lib/pictureModels/marginCurve.ts`: neue `capPriceForCost()` und `evaluatePricing()` (liefert Preis, Deckel, effektiven Faktor, Gate `ok | floor_exempt | review_required`); `supabase/functions/_shared/picture-pricing.ts` wird identisch gespiegelt.
- `src/lib/videoEnhance/pricing.ts` + `supabase/functions/_shared/video-enhance-models.ts`: Snapshot um `effectiveMultiplier`, `multiplierCap`, `pricingGate` erweitert; Versionsstrings hochgezählt.
- `src/lib/videoEnhance/rates.ts` + Servermirror: Topaz auf `per_unit`, `costUnverified` bleibt gesetzt.
- Finalisierung (`_shared/video-enhance-finalize.ts` und Reconciler): berechnet den verifizierten Faktor, schreibt ihn auf den Lauf und löst bei Überschreitung eine idempotente Wallet-Gutschrift über den bestehenden Gutschriftpfad aus (eigener Grund/Referenzschlüssel je Lauf).
- Migration (nur Ergänzungen): `effective_multiplier`, `multiplier_cap`, `pricing_gate`, `verified_effective_multiplier`, `overcharge_refund_amount`, `overcharge_refund_at` auf `video_enhance_runs`.
- Admin-Karte in `src/components/admin/cost/` mit EN/DE/ES-Texten.
- Abgeschlossene Altläufe werden nicht rückwirkend umgepreist oder gutgeschrieben.

## Freigabe

Keine globale Modellfreigabe, solange Topaz nicht über mehrere Einheiten-Datenpunkte kalibriert und ByteDance-Pricing nicht verifiziert ist.
