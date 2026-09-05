# Pricing-Regel: Kundenpreis nie über 3,0× der Providerkosten

Video Enhance soll bewusst günstig bleiben. Der Kundenpreis darf höchstens das 3,0-fache der (FX-gepufferten) Providerkosten betragen und sinkt bei teuren Läufen bis auf 1,8×.

## Ausgangslage (geprüft)

- Die degressive Kurve existiert bereits geteilt für Picture Studio und Video Enhance: 3,0× bis 0,05 € · 2,7× bei 0,30 € · 2,3× bei 1,00 € · 2,0× bei 3,00 € · 1,8× ab 5,00 €, dazwischen linear.
- Die Kurve wird heute nur als Zielwert benutzt: Der Preis ist das Maximum aus Kurvenpreis, Mindestbeitrag und Mindestpreis — nach oben gibt es keine Grenze.
- Der Topaz-Testlauf zeigt das Problem: geschätzte Providerkosten 1,50 $ (19 Einheiten), tatsächlich abgerechnet 0,48 $ (6 Einheiten). Kundenpreis 3,18 € = rund 6,9× der echten Kosten.
- Die Topaz-Preistabelle rechnet aktuell pro Ausgabesekunde (4K/30fps = 0,373 $ je 5 s). Der Provider rechnet real nach Gesamt-Pixelmenge der Ausgabe in Einheiten à 0,08 $.

## Was geändert wird

**1. Harte Obergrenze in der Preisberechnung**

Die Kurve wird zum verbindlichen Deckel: Der Endpreis wird zusätzlich gegen `Kurvenfaktor × gepufferte Providerkosten` gedeckelt. Mindestpreis und Mindestbeitrag bleiben erhalten; wenn einer davon rechnerisch über den Deckel drücken würde, wird der Lauf nicht still teurer verkauft, sondern als prüfpflichtig markiert.

Ausnahme nur für Kleinstläufe: Wenn der Deckel unter dem absoluten Mindestpreis liegt (Centbeträge), gilt der Mindestpreis und der Preis-Schnappschuss vermerkt das ausdrücklich als Boden-Ausnahme — kein stiller Aufschlag bei normalen Läufen.

**2. Effektiver Faktor wird überall mitgeführt**

Jeder Preis-Schnappschuss bekommt `effectiveMultiplier` (Kundenpreis ÷ gepufferte Providerkosten), den Deckelwert und einen Statuswert (`ok`, `floor_exempt`, `review_required`). Nach Abschluss eines Laufs wird zusätzlich der Faktor gegen die **verifizierten** Providerkosten berechnet und gespeichert.

**3. Topaz-Schätzer neu kalibrieren**

Die Topaz-Preistabelle wird von "pro Ausgabesekunde" auf das reale Abrechnungsmodell umgestellt (Einheiten aus Pixelmenge der Ausgabe × 0,08 $), kalibriert an echten Läufen. Bis mehrere Läufe die Kalibrierung bestätigen, bleibt die Karte als "Kosten unbestätigt" markiert und blockiert die globale Freigabe. Der Testlauf mit 3,18 € bleibt als Audit-Schnappschuss unverändert, gilt aber nicht als zulässiger Produktionspreis.

**4. Sichtbare Kontrolle im Admin**

Im Kostenbereich des Admin wird pro Modell/Konfiguration der effektive Faktor angezeigt — grün innerhalb 1,8×–3,0×, rot mit "Pricing blocked" darüber. Dazu die Spalten Providerkosten, gepufferte Kosten, Kundenpreis, effektiver Faktor.

**5. Tests**

- Für alle Preis-Fixtures: `1.8 ≤ effektiver Faktor ≤ 3.0` (außer ausgewiesene Boden-Ausnahme).
- Ein Faktor über 3,0 darf nie in einen freigegebenen Produktionspreis münden — er muss `review_required` erzeugen.
- Client- und Serverberechnung liefern identische Werte (bestehender Paritätstest wird erweitert).
- Regressionsfall Topaz 4K/30 mit echten 0,48 $: Preis muss im Bereich rund 1,20–1,40 € liegen.

## Technische Details

- `src/lib/pictureModels/marginCurve.ts` bekommt `capPriceForCost()` und `evaluatePricing()`; `supabase/functions/_shared/picture-pricing.ts` wird byte-gleich gespiegelt.
- `src/lib/videoEnhance/pricing.ts` und `supabase/functions/_shared/video-enhance-models.ts` erweitern den Snapshot um `effectiveMultiplier`, `multiplierCap`, `pricingGate`.
- `src/lib/videoEnhance/rates.ts` + Servermirror: Topaz auf `per_unit` mit Pixel-basierten Einheiten; `VIDEO_PROVIDER_PRICING_VERSION` und `PRICING_VERSION` werden hochgezählt.
- Neue Spalten auf `video_enhance_runs`: `effective_multiplier`, `multiplier_cap`, `pricing_gate`, `verified_effective_multiplier` (Migration, reine Ergänzung).
- Admin: neue Karte/Spalten in `src/components/admin/cost/` mit EN/DE/ES-Texten.
- Bereits abgeschlossene Läufe werden nicht rückwirkend umgepreist.

## Offene Entscheidung

Die Topaz-Kalibrierung stützt sich bisher auf einen einzigen echten Lauf (6 Einheiten bei 554 Mio. Ausgabepixeln). Vorschlag: Umstellung jetzt konservativ implementieren, Freigabe des Modells aber erst nach zwei bis drei weiteren Läufen mit unterschiedlichen Längen/Auflösungen.
