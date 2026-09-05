# Pricing-Regel: Kundenpreis nie über 3,0× der echten Providerkosten

Video Enhance bleibt bewusst günstig. Der Deckel gilt nicht nur auf der Schätzung, sondern auf den **verifizierten** Providerkosten — notfalls per automatischer Gutschrift.

## Ausgangslage (geprüft)

- Die degressive Kurve existiert bereits geteilt für Picture Studio und Video Enhance: 3,0× bis 0,05 € · 2,7× bei 0,30 € · 2,3× bei 1,00 € · 2,0× bei 3,00 € · 1,8× ab 5,00 €, linear dazwischen.
- Sie wirkt heute nur als Zielwert: Der Preis ist das Maximum aus Kurvenpreis, Mindestbeitrag und Mindestpreis — nach oben ungedeckelt.
- Topaz-Testlauf: geschätzt 1,50 $ (19 Einheiten), real abgerechnet 0,48 $ (6 Einheiten à 0,08 $). Kundenpreis 3,18 € ≈ 6,9× der echten Kosten. Ein Deckel allein auf der Schätzung hätte das nicht verhindert.
- Topaz rechnet real nach Einheiten, nicht pro Ausgabesekunde — die aktuelle Karte rechnet pro Sekunde.

## Verbindliche Preisregel

**Ebene 0 — Berechnungsbasis**

Maßgeblich ist ausschließlich die reine KI-Nutzungsbelastung dieses Laufs: nach modell- bzw. creatorbezogenem Rabatt, **vor** Mehrwertsteuer, ohne Abo-Anteil, ohne Zahlungsgebühren, ohne Promo-Guthaben-Effekte. So ergibt derselbe Provider-Lauf in jedem Land und mit jedem Gutschein denselben Faktor.

**Ebene 1 — vor dem Lauf**

Kundenpreis = degressive Kurve auf den FX-gepufferten geschätzten Providerkosten, hart gedeckelt bei 3,0×. Der Deckel ist absolut: **kein Mindestpreis und kein Mindestbeitrag darf ihn überschreiben.** Wenn ein Kleinstlauf wirtschaftlich nicht unter den Deckel passt, wird er gebündelt, blockiert oder ausdrücklich als kostenfrei behandelt — aber niemals über dem Deckel berechnet. Es gibt keine stille Boden-Ausnahme.

**Ebene 2 — nach dem Lauf**

Sobald die echten Providerkosten eindeutig vorliegen:

`verifizierter Faktor = tatsächliche Nutzungsbelastung ÷ gepufferte Ist-Providerkosten`

- ≤ 3,0× → alles in Ordnung.
- \> 3,0× → Preis-Drift: die Rate Card des Modells geht für neue Produktionsläufe auf Prüfung, **und** der Kunde erhält die Differenz automatisch als Wallet-Gutschrift.
- Berechnung: `maxAllowedCharge = auf Cent abgerundet(3,0 × gepufferte Ist-Kosten)`, `Gutschrift = max(0, belasteter Betrag − maxAllowedCharge)`. Abgerundet, damit die Garantie nicht an einem Cent scheitert.
- Der Kunden-Ausgleich läuft centgenau. Die Toleranz `PRICING_TRUE_UP_TOLERANCE_EUR = 0,01` gilt ausschließlich für den internen Drift-Alarm, nie als Abzug bei der Gutschrift.
- Ist-Kosten höher als geschätzt (Faktor unter 1,8×) → **keine** Nachbelastung. AdTool trägt die Abweichung, die Rate Card wird korrigiert. 1,8× ist Kalkulationsuntergrenze für künftige Läufe, keine rückwirkende Garantie zugunsten AdTool.
- Der vorab genehmigte Preis wird nie nachträglich erhöht.
- Die Gutschrift läuft über den eindeutigen Wallet-Schlüssel `video_enhance:{runId}:pricing_true_up` und kann bei Webhook, Reconciler und Wiederholung zusammen höchstens einmal ausgeführt werden — auch wenn die echte Kostenzahl erst lange nach Abschluss des Laufs eintrifft.

**Sperrgründe explizit**

`pricing_gate_reason` ist immer einer von: `estimate_over_cap`, `actual_cost_drift`, `cost_unverified`, `floor_conflict`.



## Topaz: Architektur jetzt, Formel später

- Preis-Typ wird jetzt auf `per_unit` umgestellt, Einheitspreis 0,08 $ eingefroren.
- Verifizierte Kosten = tatsächlich abgerechnete Einheiten × eingefrorener Einheitspreis (aus der Provider-Metrik).
- Es wird **keine** Pixel→Einheiten-Formel aus dem einen 6-Einheiten-Lauf abgeleitet. Bis zur Kalibrierung bleibt die Schätzung bewusst konservativ und die Karte als „Kosten unbestätigt" markiert.
- Weitere kurze Messläufe zum Kalibrieren: 1080p/30, 4K/30 (Referenzpunkt vorhanden), 4K/60, optional gleiche Konfiguration mit anderer Dauer.
- Der historische 3,18-€-Lauf bleibt unverändert als Audit-Schnappschuss.

## Sichtbare Kontrolle im Admin

Pro Modell/Konfiguration: Providerkosten, gepufferte Kosten, belasteter Kundenpreis, effektiver Faktor und verifizierter Faktor. Klar getrennt ausgewiesen: **Zielkorridor 1,8–3,0×** und **hartes Maximum 3,0×** — grün im Korridor, rot mit „Pricing blocked" über 3,0×, ein Lauf unter 1,8× ist nur ein Hinweis zur Rate-Card-Prüfung, kein Kundenfehler. Dazu der Sperrgrund im Klartext und eine Liste der ausgelösten Gutschriften mit Betrag und Lauf-Bezug.

## Tests

- Produktionspreis überschreitet nie 3,0× der gepufferten Schätzkosten.
- Verifizierter Faktor > 3,0 setzt die Rate Card auf Prüfung mit Grund `actual_cost_drift`.
- Nachträglicher Ausgleich senkt die Belastung auf ≤ 3,0× der gepufferten Ist-Kosten; Gutschrift genau einmal, auch bei Webhook + Reconciler + Wiederholung.
- Basis des verifizierten Faktors ist der rabattierte Ist-Betrag, nicht der Listenpreis.
- Höhere Ist-Kosten lösen nie eine Nachbelastung aus, auch unter 1,8× nicht.
- Boden-Ausnahme nur für ausdrücklich erlaubte Kleinstläufe.
- Client/Server-Parität der gesamten Preisrechnung.
- Kein Test nagelt einen konkreten Eurobetrag fest — geprüft wird immer gegen Kurve und Deckel, damit FX-Änderungen die Tests nicht brechen.

## Technische Details

- `src/lib/pictureModels/marginCurve.ts`: neue `capPriceForCost()`, `floorToCent()` und `evaluatePricing()` (liefert Preis, Deckel, effektiven Faktor, Gate plus Grund); `supabase/functions/_shared/picture-pricing.ts` wird identisch gespiegelt.
- `src/lib/videoEnhance/pricing.ts` + `supabase/functions/_shared/video-enhance-models.ts`: Snapshot um `effectiveMultiplier`, `multiplierCap`, `pricingGate`, `pricingGateReason` erweitert; Versionsstrings hochgezählt.
- `src/lib/videoEnhance/rates.ts` + Servermirror: Topaz auf `per_unit` mit eingefrorenem Einheitspreis, `costUnverified` bleibt gesetzt.
- Finalisierung (`_shared/video-enhance-finalize.ts` und Reconciler): berechnet den verifizierten Faktor aus dem belasteten Ist-Betrag, schreibt ihn auf den Lauf und löst bei Überschreitung die Wallet-Gutschrift mit dem eindeutigen Schlüssel `video_enhance:{runId}:pricing_true_up` aus.
- Migration (nur Ergänzungen): `effective_multiplier`, `multiplier_cap`, `pricing_gate`, `pricing_gate_reason`, `verified_effective_multiplier`, `true_up_refund_amount`, `true_up_refund_at` auf `video_enhance_runs`; eindeutiger Schlüssel auf dem Wallet-Referenzwert.

- Admin-Karte in `src/components/admin/cost/` mit EN/DE/ES-Texten.
- Abgeschlossene Altläufe werden nicht rückwirkend umgepreist oder gutgeschrieben.

## Freigabe

Keine globale Modellfreigabe, solange Topaz nicht über mehrere Einheiten-Datenpunkte kalibriert und ByteDance-Pricing nicht verifiziert ist.
