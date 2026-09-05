# Pricing-Regel: Kundenpreis nie über 3,0× der echten Providerkosten

Video Enhance bleibt bewusst günstig. Der Deckel gilt nicht nur auf der Schätzung, sondern auf den **verifizierten** Providerkosten — notfalls per automatischer Gutschrift.

## Ausgangslage (geprüft)

- Die degressive Kurve existiert bereits geteilt für Picture Studio und Video Enhance: 3,0× bis 0,05 € · 2,7× bei 0,30 € · 2,3× bei 1,00 € · 2,0× bei 3,00 € · 1,8× ab 5,00 €, linear dazwischen.
- Sie wirkt heute nur als Zielwert: Der Preis ist das Maximum aus Kurvenpreis, Mindestbeitrag und Mindestpreis — nach oben ungedeckelt.
- Topaz-Testlauf: geschätzt 1,50 $ (19 Einheiten), real abgerechnet 0,48 $ (6 Einheiten à 0,08 $). Kundenpreis 3,18 € ≈ 6,9× der echten Kosten. Ein Deckel allein auf der Schätzung hätte das nicht verhindert.
- Topaz rechnet real nach Einheiten, nicht pro Ausgabesekunde — die aktuelle Karte rechnet pro Sekunde.

## Verbindliche Preisregel

**Ebene 0 — Berechnungsbasis**

Maßgeblich ist ausschließlich die reine KI-Nutzungsbelastung dieses Laufs (`usage_charge_eur`): nach preisreduzierenden Rabatten, **vor** Mehrwertsteuer, ohne Abo-Anteil, ohne Zahlungsgebühren.

- **Reduziert** die Basis: Creator-Rabatt, Modellrabatt, echter Rabattgutschein — alles, was den Preis senkt.
- **Reduziert sie nicht**: Startguthaben, Promo-Credits, Wallet-Stand — das sind nur Zahlungsmittel. Ob der Kunde mit gekauftem oder geschenktem Guthaben zahlt, verändert die Modellmarge nicht.

Zwei getrennte Kostenbasen:

- Vor dem Lauf: `gepufferte Schätzkosten = geschätzte USD-Kosten × eingefrorener FX-Kurs × (1 + FX-Sicherheitspuffer)`.
- Nach dem Lauf: `Ist-Kosten = verifizierte USD-Kosten × eingefrorener FX-Kurs` — **ohne** Sicherheitspuffer. Der Puffer schützt nur die Vorabkalkulation; sonst erlaubte er faktisch 3,09× auf die echten Kosten und bräche die Garantie.

**Ebene 1 — vor dem Lauf**

Kundenpreis = degressive Kurve auf den gepufferten Schätzkosten, hart gedeckelt bei 3,0×. Der Deckel ist absolut: **kein Mindestpreis und kein Mindestbeitrag darf ihn überschreiben.** Wenn ein Kleinstlauf wirtschaftlich nicht unter den Deckel passt, wird er gebündelt, blockiert oder ausdrücklich als kostenfrei behandelt — aber niemals über dem Deckel berechnet. Es gibt keine stille Boden-Ausnahme.

**Ebene 2 — nach dem Lauf**

Sobald die echten Providerkosten eindeutig vorliegen:

`verifizierter Faktor = Nutzungsbelastung ÷ ungepufferte Ist-Providerkosten`

- ≤ 3,0× → alles in Ordnung.
- \> 3,0× → Preis-Drift: die Rate Card des Modells geht für neue Produktionsläufe auf Prüfung, **und** der Kunde erhält die Differenz automatisch als Wallet-Gutschrift.
- Berechnung: `maxAllowedCharge = auf Cent abgerundet(3,0 × ungepufferte Ist-Kosten)`, `Gutschrift = max(0, Nutzungsbelastung − maxAllowedCharge)`. Abgerundet, damit die Garantie nicht an einem Cent scheitert.
- Der Kunden-Ausgleich läuft centgenau. Die Toleranz `PRICING_TRUE_UP_TOLERANCE_EUR = 0,01` gilt ausschließlich für den internen Drift-Alarm, nie als Abzug bei der Gutschrift.
- Ist-Kosten höher als geschätzt (Faktor unter 1,8×) → **keine** Nachbelastung. AdTool trägt die Abweichung, die Rate Card wird korrigiert. 1,8× ist Kalkulationsuntergrenze für künftige Läufe, keine rückwirkende Garantie zugunsten AdTool.
- Der vorab genehmigte Preis wird nie nachträglich erhöht.
- Die Gutschrift läuft über den eindeutigen Wallet-Schlüssel `video_enhance:{runId}:pricing_true_up` und kann bei Webhook, Reconciler und Wiederholung zusammen höchstens einmal ausgeführt werden — auch wenn die echte Kostenzahl erst lange nach Abschluss des Laufs eintrifft.
- Die ursprüngliche Belastung bleibt erhalten: `captured_usage_charge_eur` wird nie überschrieben; daneben stehen `true_up_refund_amount` und `net_usage_charge_eur`. Ausgewiesen werden beide Faktoren — vor und nach dem Ausgleich (z. B. „ursprünglich 6,9× → korrigiert → final 3,0×").
- Fehlen die echten Kosten, sind sie 0 oder widersprüchlich: **kein** Faktor, **keine** automatische Gutschrift. Der Faktor bleibt leer und der Grund `cost_unverified` steht, bis eine autoritative positive Kostenzahl vorliegt.

**Sperrgründe explizit**

`pricing_gate_reason` ist immer einer von: `estimate_over_cap`, `actual_cost_drift`, `cost_unverified`, `estimator_calibrating`, `floor_conflict`.

Eine Sperre gilt immer für die betroffene **Rate-Card-Version** (z. B. `topaz-video-v3`), nicht dauerhaft für das Modell. Eine korrigierte, neu getestete Version kann freigegeben werden, ohne historische Läufe oder ihre Preis-Schnappschüsse zu verändern.




## Topaz: Ist-Rechnung verifiziert, Schätzer in Kalibrierung

Zwei getrennte Statuswerte statt eines pauschalen „Kosten unbestätigt":

- `providerCostAccounting = verified` — die Ist-Kosten stehen fest: tatsächlich abgerechnete Einheiten × eingefrorener offizieller Einheitspreis (0,08 $).
- `providerCostEstimator = calibrating` — wie viele Einheiten ein künftiger Lauf verbraucht, ist noch nicht belegt.

- Preis-Typ wird jetzt auf `per_unit` umgestellt.
- Es wird **keine** Pixel→Einheiten-Formel aus dem einen 6-Einheiten-Lauf abgeleitet; bis zur Kalibrierung bleibt die Vorab-Schätzung bewusst konservativ.
- Weitere kurze Messläufe: 1080p/30 (Auflösungsskalierung), 4K/30 (Referenzpunkt vorhanden), 4K/60 (fps-Skalierung), gleiche Konfiguration mit anderer Dauer (Zeitskalierung). Erst danach wird geprüft, ob Einheiten proportional zu Breite × Höhe × Frames laufen oder ob Stufen/Rundungen existieren.
- Der historische 3,18-€-Lauf bleibt unverändert als Audit-Schnappschuss.

## Sichtbare Kontrolle im Admin

Pro Lauf: geschätzte Providerkosten, Ist-Providerkosten, Nutzungsbelastung, geschätzter Faktor, verifizierter Faktor, maximal erlaubter Betrag, ausgelöste Gutschrift und Sperrgrund. Klar getrennt ausgewiesen: **Zielkorridor 1,8–3,0×** und **hartes Maximum 3,0×** — grün im Korridor, rot mit „Pricing blocked" über 3,0×; ein Lauf unter 1,8× ist nur ein Hinweis zur Rate-Card-Prüfung, kein Kundenfehler.

Pro Modell aggregiert: mittlerer und medianer Schätzfehler, tatsächlicher Faktor, Summe der Gutschriften, Status der Rate Card sowie die beiden Status Ist-Rechnung/Schätzer.

## Tests

- Produktionspreis überschreitet nie 3,0× der gepufferten Schätzkosten — auch dann nicht, wenn Mindestpreis oder Mindestbeitrag höher lägen (dann greift `floor_conflict`, kein stiller Aufpreis).
- Verifizierter Faktor > 3,0 setzt die Rate Card auf Prüfung mit Grund `actual_cost_drift`.
- Nachträglicher Ausgleich senkt die Belastung auf ≤ 3,0× der **ungepufferten** Ist-Kosten.
- Der Nachlauf-Faktor überschreitet nie 3,0× der ungepufferten Ist-Kosten in Euro — auch nach FX-Umrechnung und Cent-Rundung nicht; der FX-Puffer fließt nie in den Nachlauf-Deckel.
- Race-Test: Webhook, Reconciler und ein Retry gleichzeitig erzeugen zusammen **genau eine** Gutschrift.
- Späte Kosten: ein bereits abgeschlossener Lauf erhält erst danach die verifizierte Kostenzahl — der Ausgleich läuft trotzdem sicher und genau einmal.
- Basis des verifizierten Faktors ist die rabattierte Nutzungsbelastung ohne Steuern, Abo- und Zahlungsgebühren; eingesetztes Promo- oder Startguthaben verändert sie nicht.
- Höhere Ist-Kosten lösen nie eine Nachbelastung aus, auch unter 1,8× nicht.
- Client/Server-Parität der gesamten Preisrechnung.
- Kein Test nagelt einen konkreten Eurobetrag fest — geprüft wird immer gegen Kurve und Deckel, damit FX-Änderungen die Tests nicht brechen.

## Technische Details

- `src/lib/pictureModels/marginCurve.ts`: neue `capPriceForCost()`, `floorToCent()` und `evaluatePricing()` (liefert Preis, Deckel, effektiven Faktor, Gate plus Grund); `supabase/functions/_shared/picture-pricing.ts` wird identisch gespiegelt.
- `src/lib/videoEnhance/pricing.ts` + `supabase/functions/_shared/video-enhance-models.ts`: Snapshot um `effectiveMultiplier`, `multiplierCap`, `pricingGate`, `pricingGateReason` erweitert; Versionsstrings hochgezählt.
- `src/lib/videoEnhance/rates.ts` + Servermirror: Topaz auf `per_unit` mit eingefrorenem Einheitspreis; `costUnverified` wird durch `providerCostAccounting` + `providerCostEstimator` ersetzt.
- Finalisierung (`_shared/video-enhance-finalize.ts` und Reconciler): berechnet den verifizierten Faktor aus der belasteten Nutzungssumme, schreibt ihn auf den Lauf und löst bei Überschreitung die Wallet-Gutschrift mit dem eindeutigen Schlüssel `video_enhance:{runId}:pricing_true_up` aus.
- Migration (nur Ergänzungen): `effective_multiplier`, `multiplier_cap`, `pricing_gate`, `pricing_gate_reason`, `verified_effective_multiplier`, `usage_charge_eur`, `max_allowed_charge_eur`, `true_up_refund_amount`, `true_up_refund_at` auf `video_enhance_runs`; eindeutiger Index auf dem Wallet-Referenzschlüssel.
- Admin-Karte in `src/components/admin/cost/` mit EN/DE/ES-Texten.
- Abgeschlossene Altläufe werden nicht rückwirkend umgepreist oder gutgeschrieben.


## Freigabe

Keine globale Modellfreigabe, solange Topaz nicht über mehrere Einheiten-Datenpunkte kalibriert und ByteDance-Pricing nicht verifiziert ist.
