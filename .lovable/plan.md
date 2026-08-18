# FA-4 Provider-No-op Fix Contract

Ausgangslage: `FA-4 CONTROLLED RETEST = BLOCKED` durch 2 x P0 provider silent no-op (T4 Kay / p5, T6 Samuel / p3). Root-Cause-Lock = `SYNCSO_PROVIDER_NOOP`. Geometry v402, Preclip, Audio-Preparation, Fan-out und Mux sind entlastet und bleiben eingefroren.

## Ziel

Einen engen, messbaren Fix-Contract für die beiden Ausfälle definieren, bevor eine einzige Zeile Code geändert wird. Der Fix darf nur die Provider-Reaktion beeinflussen — nicht die bereits bewiesenen Stufen.

## Nicht-Ziel / Frozen Scope

- Keine Änderung an `plate-face-candidates.ts` v402 (Geometry/Hungarian).
- Keine Änderung an `preclip-crop-containment.ts` (Contract E).
- Keine Änderung an Fan-out, Ledger-Identität, RS3 oder Mux-Timing.
- Keine generelle Architektur-Umbau (z.B. Rückkehr zu vollplattiger Kette, segments[]-Single-Call, neuer Provider).
- Kein neuer Render und kein Deploy in diesem Plan.

## Hypothesen für Sync.so silent no-op

Basierend auf den Forensik-Zahlen (T4/T6 Input valide, Output Δ ≤ 0) sind diese drei Hypothesen plausibel und testbar:

1. **ASD-Modus-Heuristik**: Der für p3/p5 verwendete `active_speaker_detection`-Modus (z.B. `auto_detect` vs. Koordinaten vs. `bounding_boxes_url`) führt bei bestimmten Gesichts-/Crop-Konfigurationen zu einem stillen No-op, obwohl der Job `succeeded` meldet.
2. **Audio-Window / Lead-in / LUFS**: Die aktuelle Audio-Normalisierung (lead-in 0.25s, LUFS -16, peak -1 dBFS) reicht für manche Stimmen/Sprechtempi nicht aus, um Sync.so über die interne VAD-Schwelle zu heben. T4/T6 könnten knapp unterhalb der Provider-internen Aktivierungsschwelle liegen.
3. **Modell- / Retry-Varianten-Heuristik**: `lipsync-2-pro` (aktueller Primary) behandelt bestimmte Gesichtsgrößen, Kopfhaltungen oder Hintergründe als "still frame" und verweigert die Motion. `sync-3` oder eine andere Retry-Variante könnte dieselben Inputs anders bewerten.

## Fix-Contract-Optionen

Nur diese drei Optionen sind im engen Scope zulässig. Eine davon wird im Plan ausgewählt; Kombinationen sind erst nach isolierter Validierung erlaubt.

### Option A — ASD-Modus-Korrektur

Für Multi-Speaker-Preclips mit sauberer Geometrie (v402) den ASD-Modus so wählen, dass Sync.so keine Heuristik-Entscheidung mehr treffen muss.

- Vorschlag: Statt `auto_detect` oder Einzelkoordinaten auf dem 720px-Preclip für p3/p5 eine deterministische `bounding_boxes_url` (oder inline `bounding_boxes`) verwenden, die exakt das Zielgesicht pro Frame umschließt.
- Bedingung: Die Boxen müssen aus derselben Geometrie-Quelle (`reference_image_url`, v402) stammen wie die Koordinaten; kein neues Face-Detection-Ergebnis.
- Messung: Vor einem echten Render muss eine Fixture-basierte Unit-Test-Suite beweisen, dass für S11 p3/p5 die generierten Boxen die gleiche Mund-ROI wie die erfolgreichen Controls treffen.

### Option B — Audio-Preparation-Anpassung

Die Audio-Normalisierung so verändern, dass Sync.so für T4/T6 dieselbe Aktivierungswahrscheinlichkeit sieht wie für T1/T2/T3/T5.

- Zulässige Parameter: `leadInSec`, `targetLufs`, `peakDbFs`, VAD-Window-Slicing (`detectVoicedRange`), minimale Gesamtdauer.
- Verboten: Veränderung der Sprech-Sample-Rate, Kanäle oder des eigentlichen Dialog-Inhalts.
- Messung: Für jeden der 6 S11-Passes die exakt dispatch-bereite WAV nach dem neuen Schema messen und mit den erfolgreichen Controls angleichen (RMS, LUFS, voiced ratio, first/last voiced sec, peak dBFS).

### Option C — Retry-Ladder-Erweiterung für No-op

Nach Provider-Output eine automatische Motion-Probe durchführen; bei nachweislichem No-op denselben Pass mit einer alternativen, bewährten Konfiguration erneut dispatch.

- Zulässig: Ein Retry-Varianten-Schritt, der bei `provider_no_op` (nicht bei generischem `succeeded`) auslöst.
- Verboten: Beliebige Retry-Schleifen, Modell-Wechsel ohne Contract oder Auslösung bei jedem `succeeded`.
- Messung: Unit-Tests für die Motion-Probe müssen T4/T6 als no-op und T1/T2/T3/T5 als motion erkennen; Retry muss idempotent und RS3-sicher sein.

## Empfohlene Option

**Option A zuerst**, weil:

- Die Geometrie bereits bewiesen korrekt ist — es fehlt nur die richtige Übergabe an Sync.so.
- `bounding_boxes_url` ist der deterministischste ASD-Modus in der Sync.so-Doku.
- Sie verändert keinen Audio-Pfad und braucht keinen zusätzlichen Render-Retry.

Falls Option A in einem kontrollierten Test nicht greift, wird Option B geprüft. Option C ist der Fallback, wenn A und B isoliert keine Wirkung zeigen.

## Akzeptanzkriterien für den Fix

1. **Fixture-Test**: Mit denselben S11-Inputs (p3 Samuel, p5 Kay) muss der neue Dispatch-Payload in einer Unit-Test-Fixture erzeugt werden können und die Mund-ROI-Boxen müssen die erwarteten Slots treffen.
2. **Vergleichbarkeit**: Die neuen Payloads für p0/p1/p2/p4 (erfolgreiche Controls) dürfen sich nicht verschlechtern; ihre ASD-Information muss entweder identisch bleiben oder eine bewiesene Verbesserung darstellen.
3. **Keine Regression**: Single-Speaker-Szenen, die aktuell funktionieren, müssen unverändert bleiben.
4. **Messbarer Erfolg**: Ein nachfolgender Controlled Retest auf S11 muss für T4 und T6 ein positives Provider-Output-Delta (Δ peak > 0) zeigen, bevor visuelle Abnahme erlaubt ist.

## Nächster Schritt nach Plan-Approval

1. Implementiere Option A in `compose-dialog-segments/index.ts` (nur ASD-Modus-Selektion für Multi-Speaker-Preclips).
2. Erstelle Unit-Tests mit der echten S11-Fixture (4 Anchor-Center + 10 Kandidatenboxen).
3. Kein Deploy, kein Render, bis Unit-Tests PASS und du den Payload-Diff freigibst.

## Abschluss dieses Plans

Nach Approval: `FA-4 PROVIDER-NO-OP FIX CONTRACT = APPROVED → STOP`.
