# V465 — ASD Box-Semantik und kontrollierter Provider-A/B-Fix

## Bestätigter Ist-Zustand

- Der kontrollierte S01-Lauf `6739f73e-9f40-4382-89fc-2562ff99444b` endete mit `v459_terminal_required_pass_failure`.
- V464 war auf allen sechs Passes aktiv: `registration=per_frame`, variable Boxen und jeweils `12/12` geprüfte Mundpunkte innerhalb der Box.
- Sync‑3 lieferte trotzdem bei Pass 1, 2, 4 und 5 einen echten NOOP; Pass 3 zeigte klare zusätzliche Bewegung.
- Die V461-Fingerprints sind für alle Passes vorhanden und verschieden. Eine semantisch identische Transport-Eskalation wurde korrekt verhindert.
- Der V459-Euro-Refund wurde einmalig mit 4,50 € gebucht; der Wallet-Saldo blieb bei 500 €.

## Umsetzung

1. **Gefrorene Artefakte auswerten**
   - Für je einen NOOP- und den erfolgreichen Pass exakt die bereits gepinnten Preclips, Audios, Provider-Ausgaben und ASD-JSONs verwenden.
   - Boxgröße, Face-Abdeckung, Mundposition, zeitliche Boxbewegung und ROI-Motion frameweise gegenüberstellen.
   - Prüfen, ob die aktuell aus der großen Legacy-Dispatch-Box abgeleiteten ASD-Boxen trotz korrekter Registrierung zu breit oder vertikal falsch gewichtet sind.

2. **Minimalen Provider-A/B-Test durchführen**
   - Gleicher Preclip, gleiches Audio, gleiches Sync‑3-Modell und `cut_off`; nur die ASD-Semantik variiert.
   - Varianten: aktuelles V464-ASD, engere gesichtsproportionale per-frame ASD-Box und kein ASD als Kontrollarm.
   - Keine neue Szene und kein kompletter 6-Pass-Lauf; nur gepinnte Einzelpass-Artefakte.

3. **Nur den belegten Fix implementieren**
   - Wenn die engere per-frame Box gewinnt: V464-Projektion auf eine klar definierte gesichtsproportionale Box umstellen, Frame-/Crop-Kohärenz und 100-%-Mund-Containment beibehalten.
   - Wenn ausschließlich „kein ASD“ gewinnt: für nachweislich single-face Preclips ASD weglassen; Multi-Face-/Full-Plate-Pfade bleiben unverändert geschützt.
   - Keine Provider-Umschaltung, keine Lockerung des V461-Face-Gates und keine Änderung an V459-Refunds.

4. **Regression und Deployment**
   - Fixture-Tests für dynamischen S01-Track, statischen GOLD-Fall, Boxgrenzen, Framezahl und Mouth-Containment ergänzen.
   - Betroffene Edge Function testen und deployen.
   - Danach STOP vor einem weiteren vollständigen S01-Rerender; zuerst A/B-Ergebnis, Payload-Diff und Refund-Sicherheit berichten.

## Akzeptanz

- Der gewählte Einzelpass erzeugt gegenüber seinem Preclip messbare zusätzliche Mundbewegung und kein NOOP-Verdikt.
- ASD bleibt bei dynamischer Bewegung framevariabel, im finalen 720×720-Preclip-Raum und vollständig bounds-valid.
- Kein bestehender Gate-, Fingerprint-, Fence- oder Euro-Refund-Vertrag wird abgeschwächt.
