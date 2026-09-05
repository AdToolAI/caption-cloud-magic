# Video Enhance: Zielkorridor-Markierung und unbefristete Nachkorrektur

Zwei kleine, nicht-blockierende Korrekturen. Beide Modelle bleiben live, es gibt keine neuen Sperren.

## Ausgangslage (geprüft)

- Der Topaz-Lauf mit Faktor 1,49× wird heute als vollständig unauffällig gewertet: liegt der Faktor unter der Obergrenze, bleibt der Status "ok" und es entsteht kein Kalibrier-Hinweis. Ein Wert unterhalb des Zielkorridors 1,8×–3,0× ist damit derzeit nicht sichtbar.
- Die nachträgliche Kostenprüfung für bereits abgeschlossene Läufe sucht ausschließlich Läufe der letzten 30 Tage. Ältere Läufe ohne bestätigte Anbieterkosten fallen heute tatsächlich dauerhaft aus der Nachkorrektur heraus.

Beides ändern wir.

## 1. Zielkorridor sichtbar machen (nur Auswertung)

Liegt der bestätigte Faktor unter 1,8×, wird der Lauf künftig als "unterhalb Zielkorridor – Kalibrierung" markiert. Das ist reine Auswertung:

- keine Nachbelastung, niemals
- kein Produktionsblocker, keine Sperre für das Modell
- Kunde sieht davon nichts
- im Admin erscheint der Lauf im Kalibrier-Block (nicht im Betriebsstatus-Block), damit genau solche echten Läufe die Topaz-Schätzung nachjustieren

Über der Obergrenze bleibt alles wie bisher: automatische Gutschrift, Rate Card zur Prüfung.

## 2. Nachkorrektur ohne Verfallsdatum

Ein Lauf ohne bestätigte Anbieterkosten bleibt unbegrenzt nachkorrigierbar — bis die Kosten entweder bestätigt oder administrativ endgültig geschlossen sind.

- Die 30 Tage bleiben nur das bevorzugte Suchfenster für den häufigen Fall.
- Zusätzlich läuft ein Nachzügler-Durchgang über ältere offene Läufe, in kleinen Portionen und mit wachsenden Abständen, damit nichts dauerhaft verloren geht.
- Trifft später eine belastbare Kostenzahl ein, greift derselbe 3×-Check und es entsteht höchstens eine einzige Gutschrift pro Lauf.
- Ein Admin kann einen Lauf endgültig schließen (z. B. wenn der Anbieter nie eine Zahl liefert). Erst dann verlässt er das Nachkorrektur-System, mit Grund und Zeitstempel.
- "Kosten unbestätigt" bleibt in jedem Fall reiner Admin-Status und blockiert nie einen Lauf.

## Technische Details

- `src/lib/videoEnhance/pricing.ts` + Servermirror: `evaluateTrueUp` liefert zusätzlich `belowTargetCorridor` und setzt bei bestätigtem Faktor < `1.8` den Grund `below_target_corridor`; `pricing_gate` bleibt dabei `ok` (nur `pricing_gate_reason`/neues Feld wird gefüllt), damit nichts blockiert.
- Migration (nur Ergänzungen) auf `public.video_enhance_runs`: `cost_closed_at timestamptz`, `cost_closed_by uuid`, `cost_closure_reason text`, `late_cost_attempts integer not null default 0`, `next_late_check_at timestamptz`.
- `supabase/functions/video-enhance-reconcile/index.ts`: Late-Cost-Schleife verliert das harte `gte(created_at, 30d)`. Stattdessen zwei Selects — frisches Fenster (< 30 Tage) und Nachzügler (älter, `cost_closed_at is null`, `next_late_check_at <= now()`), beide mit `BATCH_SIZE`. Nach jedem Versuch `late_cost_attempts++` und `next_late_check_at` per Backoff (Stunden → Tage, Deckel z. B. 7 Tage).
- `applyLateCostTrueUp` bleibt unverändert idempotent (ein `true_up_refund` pro Lauf) und überspringt Läufe mit gesetztem `cost_closed_at`.
- Admin: `VideoEnhanceCalibrationCard` zeigt zusätzlich "unter Zielkorridor" und "offene Kostenprüfungen"; Betriebsstatus (Live / Not-Aus) bleibt optisch getrennt.
- Tests: bestätigter Faktor 1,49× → keine Gutschrift, kein Block, Markierung gesetzt; Lauf älter als 30 Tage bekommt bei später eintreffender Kostenzahl genau eine Gutschrift; administrativ geschlossener Lauf wird nicht mehr angefasst.

Keine Änderungen an Wallet-Grundlogik, Lip-Sync oder Render-Pfaden.
