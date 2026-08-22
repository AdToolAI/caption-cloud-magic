# V435 — Immutable Calibration Bootstrap + Samuel Cross-Test

Ziel: den Samuel-T2-No-op erstmals auf Bytes untersuchen, die sich nicht selbst überschreiben. Kein Umbau der Vier-Sprecher-Pipeline, kein Gate-Switch, keine neue autoritative Kalibrierung.

Ausgangslage (verifiziert): V434-Module liegen unter `supabase/functions/_shared/v434-*.ts` und sind in `sync-so-webhook` + `compose-dialog-segments` verdrahtet; `scripts/calibration/v434/manifest.json` enthält ausschließlich sechs `legacy_non_reproducible` S11-Samples; der Lip-Sync-Freeze (`.lovable/LIPSYNC-FEATURE-FREEZE.md`) erlaubt reine Telemetrie und Infrastruktur außerhalb der Kette, keine Gate-/Threshold-/Payload-Änderungen.

## Phase 1 — Kontrollierter Referenzlauf (erzeugt die ersten echten Pins)

1. Vorflug-Check: bestätigen, dass `v434_artifact_pins` leer ist und die deployte Version der beiden Functions den Pin-Pfad enthält. Wenn nicht: stoppen und melden, nicht "reparieren".
2. Eine isolierte Dialogszene mit dem Samuel-T2-/T6-Setup neu starten (frische `run_id`, neue `generation`) — über den normalen Produktionsweg, ohne Sonderpfad, damit der Lauf repräsentativ bleibt.
3. Nach dem Lauf prüfen: für jeden Turn existiert je ein Pin für Preclip und Provider-Output mit `run_id`/`generation`/`pass_idx`/`attempt` und sha256. Fehlende Pins = Phase-1-Fail; Phase 2 startet dann nicht.
4. Alle Pins der Szene als Referenzsatz protokollieren (Keys + sha256), damit spätere Messungen exakt dieselben Bytes ziehen.

Abbruchbedingung: Wenn der Referenzlauf selbst fehlschlägt (Provider-Fehler, Reset, Refund), wird das dokumentiert und Phase 2 verschoben — es wird nicht auf alte mutable Artefakte ausgewichen.

## Phase 2 — A/B/C/D-Matrix auf exakt diesen Pins

Offline-Harness (Script, keine Änderung an der Produktionskette). Er lädt ausschließlich gepinnte Bytes, verifiziert vor jeder Messung den sha256 und verweigert die Zelle bei Mismatch.

| Zelle | Variation |
|---|---|
| A | Referenzlauf T2 unverändert (Baseline-Wiederholung) |
| B | T2-Audio gegen einen bekannt funktionierenden Turn getauscht |
| C | T2-Audio auf dem Preclip/Face-Window eines funktionierenden Turns |
| D | T2 identisch zu A, zweiter Provider-Attempt (Sporadik-Test) |

Pro Zelle erfasst: geometry-coupled Mouth-ROI, MAD-Ratio, alter ΔMean-Wert, menschliches Label aus einem Mouth-Strip-Contact-Sheet.

Auswertungsregeln (vorab festgelegt, damit das Ergebnis nicht nachträglich interpretiert wird):

- A und B no-op, C motion → Preclip/Face-Window ist der Auslöser.
- A und C no-op, B motion → T2-Audio bzw. Turn-Conditioning ist der Auslöser.
- A ≠ D → Sync.so verhält sich sporadisch; Folgearbeit ist eine qualitätsgesteuerte Retry-Policy.
- Alle vier durch MAD-Ratio sauber getrennt → starke Evidenz für die scale-free Metrik als künftigen Outcome-Gate-Kandidaten (noch keine Umstellung).

## Kalibrierung: sammeln, nicht abschließen

Die aus dem frischen Lauf entstehenden, menschlich gelabelten Samples werden als `reproducible` ins Manifest aufgenommen — mit Keys und sha256. Es wird **keine** Schwelle abgeleitet und keine autoritative Kalibrierung erklärt. Die Freigabekriterien für einen späteren autoritativen Gate werden im Manifest festgeschrieben: mehrere Sprecher, verschiedene Crop-Größen, verschiedene Turn-Längen, und ≥3 sauber gelabelte Samples pro Klasse als absolute Untergrenze.

## Was ausdrücklich nicht passiert

- Kein Umschalten des autoritativen Verdicts auf MAD-Ratio oder auf die neue ROI.
- Keine Änderung an v404-Schwellen, Provider-Payload, Framing oder Zustandsmaschine.
- Kein Fix des Samuel-T2-Fehlers in diesem Gate — V435 liefert die Ursache, nicht die Korrektur.

## Technische Details

- Neues Script `scripts/calibration/v435/cross-test.mjs`: liest Pins aus `v434_artifact_pins`, verifiziert sha256, ruft die reinen V434-Module (`v434-mad-ratio.ts`, `v434-motion-roi.ts`) auf, schreibt eine Zellen-Tabelle als JSON + Markdown.
- Frame-Extraktion für Mouth-Strips folgt der bestehenden AWS-only-Motion-Probe-Regel; kein Replicate.
- Manifest-Erweiterung über `scripts/calibration/v434-manifest.mjs`; Validierung bleibt die bestehende aus `v434-calibration-manifest.ts`.
- Ergebnisbericht: `docs/v435-immutable-calibration-bootstrap.md`.
- Tests: Harness-Einheiten (sha256-Verweigerung, Zellen-Auswertungsregeln) in `src/test/`; die zehn frozen-contract-Tests müssen unverändert grün bleiben.

## Abschluss

Ein Gate-Verdikt: `V435 = PASS/FAIL — <Phase-1-Pins ja/nein> + <Primärursache laut A/B/C/D oder "unentschieden">` → STOP.
