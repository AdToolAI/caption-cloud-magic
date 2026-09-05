# Video Enhance: Zielkorridor-Markierung und unbefristete Nachkorrektur

Zwei kleine, nicht-blockierende Korrekturen. Beide Modelle bleiben live, es gibt keine neuen Sperren.

## Ausgangslage (geprüft)

- Der Topaz-Lauf mit Faktor 1,49× wird heute als vollständig unauffällig gewertet: liegt der Faktor unter der Obergrenze, bleibt der Status "ok" und es entsteht kein Kalibrier-Hinweis. Ein Wert unterhalb des Zielkorridors 1,8×–3,0× ist damit derzeit nicht sichtbar.
- Die nachträgliche Kostenprüfung für bereits abgeschlossene Läufe sucht ausschließlich Läufe der letzten 30 Tage. Ältere Läufe ohne bestätigte Anbieterkosten fallen heute tatsächlich dauerhaft aus der Nachkorrektur heraus.

Beides ändern wir.

## 1. Zielkorridor sichtbar machen (nur Auswertung)

Liegt der bestätigte Faktor unter 1,8×, wird der Lauf künftig als "unterhalb Zielkorridor – Kalibrierung" markiert. Das ist reine Auswertung und wird strikt vom Preis-Gate getrennt geführt:

- keine Nachbelastung, niemals
- kein Produktionsblocker, keine Sperre für das Modell
- Kunde sieht davon nichts
- Preis-Gate bleibt "in Ordnung"; der Hinweis erscheint ausschließlich im Kalibrier-Block des Admin, damit niemand daraus später einen Blocker ableitet

Über der Obergrenze bleibt alles wie bisher: automatische Gutschrift, Rate Card zur Prüfung.

## 2. Nachkorrektur ohne Verfallsdatum

Ein Lauf ohne bestätigte Anbieterkosten bleibt unbegrenzt nachkorrigierbar — bis die Kosten entweder bestätigt oder administrativ endgültig geschlossen sind.

- Trifft über irgendeinen aktiven Weg (Anbieter-Rückmeldung, Abrechnung, Abgleich) eine belastbare Kostenzahl ein, wird sofort nachkorrigiert — nicht erst beim nächsten geplanten Durchlauf.
- Der geplante Durchlauf ist nur Auffangnetz: 30 Tage bleiben das bevorzugte Suchfenster, zusätzlich läuft ein Nachzügler-Durchgang über ältere offene Läufe in kleinen Portionen mit wachsenden Abständen.
- Pro Lauf entsteht höchstens eine einzige Gutschrift, egal über welchen Weg die Zahl kommt.
- Ein Admin kann einen Lauf endgültig schließen (z. B. wenn der Anbieter nie eine Zahl liefert): nur Admin, Begründung Pflicht, Vorgang wird protokolliert. Ein Wiederöffnen ist möglich, ebenfalls nur mit Begründung und Protokoll — keine stille Rücksetzung.
- "Kosten unbestätigt" bleibt in jedem Fall reiner Admin-Status und blockiert nie einen Lauf.

## Technische Details

- `src/lib/videoEnhance/pricing.ts` + Servermirror: `evaluateTrueUp` liefert zusätzlich `calibrationStatus: 'ok' | 'review'` und `calibrationReason: 'below_target_corridor' | 'estimator_drift' | null`. `pricing_gate`/`pricing_gate_reason` bleiben ausschließlich für gate-relevante Gründe (`actual_cost_drift`, `cost_unverified`, `floor_conflict`) reserviert; ein Faktor < 1,8 setzt nur die Kalibrierfelder.
- Migration (nur Ergänzungen) auf `public.video_enhance_runs`: `calibration_status text not null default 'ok'`, `calibration_reason text`, `cost_closed_at timestamptz`, `cost_closed_by uuid`, `cost_closure_reason text`, `late_cost_attempts integer not null default 0`, `next_late_check_at timestamptz`. Dazu Partial Index:
  `create index ... on public.video_enhance_runs (next_late_check_at) where provider_cost_usd_actual is null and cost_closed_at is null;`
- Aktiver Pfad: `video-enhance-webhook` und jede andere Stelle, die eine autoritative Kostenzahl sieht, ruft direkt `applyLateCostTrueUp` und markiert die Kosten als verifiziert. Der Scanner in `video-enhance-reconcile` sucht nur noch Läufe, bei denen das nie passiert ist.
- `supabase/functions/video-enhance-reconcile/index.ts`: Late-Cost-Schleife verliert das harte `gte(created_at, 30d)`; zwei Selects (frisches Fenster, Nachzügler mit `cost_closed_at is null` und `next_late_check_at <= now()`), beide mit `BATCH_SIZE`, danach `late_cost_attempts++` und Backoff (Stunden → Tage, Deckel 7 Tage).
- `applyLateCostTrueUp` bleibt idempotent (genau ein `true_up_refund` pro Lauf) und überspringt geschlossene Läufe.
- Admin-Schließen/Wiederöffnen: neue Aktion nur für Admins (Rollenprüfung serverseitig über `has_role`), Grund verpflichtend, jeder Vorgang als Audit-Eintrag (bestehende Admin-Audit-Tabelle) mit Lauf-ID, Aktion, Grund, Admin-ID.
- Admin-UI: `VideoEnhanceCalibrationCard` zeigt "Preis-Gate: OK" und getrennt "Kalibrierung: Prüfung — unter Zielkorridor" sowie offene Kostenprüfungen; Betriebsstatus (Live / Not-Aus) bleibt eigener Block.
- Tests: 1,49× → keine Gutschrift, Preis-Gate `ok`, Kalibrierung `review`/`below_target_corridor`; aktiv eintreffende Kostenzahl korrigiert sofort und genau einmal; Lauf älter als 30 Tage bleibt korrigierbar; geschlossener Lauf wird nicht mehr angefasst; Schließen ohne Grund oder ohne Adminrolle wird abgelehnt.

Keine Änderungen an Wallet-Grundlogik, Lip-Sync oder Render-Pfaden.

