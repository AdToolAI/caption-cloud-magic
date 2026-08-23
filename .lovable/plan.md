# V461 — Kontrollierter S01-Lauf: Read-only Abschluss und STOP

## Verifizierter Befund

- Der kontrollierte Lauf ist `14417b09-7287-4bbd-b059-94eb446491b5` für Szene `be60d106-6908-4002-95d1-2bd01c5cfa6c`.
- Vier unterschiedliche Preclips wurden genau einmal an den Provider gesendet. Alle vier Resultate wurden vom eingefrorenen Motion-Gate als echte NOOPs bewertet.
- Der V461-Semantik-Dedup hat die transport-only Wiederholung jeweils verhindert. Pass 4 und 5 (UI: 5/6 und 6/6) wurden anschließend durch den V459-Fan-out-Abschluss storniert. Die Anzeige „4/6“ entspricht daher vier abgeschlossenen Provider-Auswertungen, nicht einem Absturz mitten in Pass 4.
- Das harte V461-Face-Gate hat alle vier Inputs korrekt passieren lassen: `face_share` 0,288–0,291 liegt über 0,24; Provider-Face-Size ca. 467 px liegt über 144 px; ROI und Identität waren gültig.
- Jeder Dispatch besitzt einen semantischen Fingerprint mit Video-/Audio-Objekt, Box-Hash, Framecount, Modell und Sprecherindex. Die vier Fingerprints sind unterschiedlich und am jeweiligen Pass persistiert.
- Die Telemetrie beschreibt die echten 720×720-Preclips mit individuellen Byte-Größen; die alten Plate-Werte 1284×718 wurden nicht als Dispatch-Maße verwendet.
- Der Euro-Pfad ist korrekt: einmal −4,50 € mit Szene/Run-Verknüpfung, einmal +4,50 € idempotente Erstattung; Endsaldo wieder 500,00 €. Keine Credit-Erstattung wurde verwendet.

## Abschluss dieses Gates

1. Eine kompakte Attempt-/Gate-/Fingerprint-/Telemetry-/Wallet-Matrix als dauerhaften V461-Laufbericht dokumentieren.
2. V461 mit folgendem Urteil schließen:
   - Face-Gate: PASS
   - Semantik-Dedup: PASS
   - Dispatch-Telemetrie: PASS
   - Euro-Refund: PASS
   - S01-Ergebnis: ehrlicher terminaler Provider-NOOP bei vier gültigen, unterschiedlichen Inputs
3. Keine Schwellen, Motion-Detektoren, Crops, Provider-Routen oder Wallet-Logik ändern.
4. Keinen weiteren S01-Lauf starten. Nach Berichtserstellung STOP.

## Technische Evidenz im Bericht

- Pass 0–3: je ein `DISPATCHED`-Datensatz, 720×720, anschließend `NOOP_LADDER_EXHAUSTED` ohne zweiten semantisch identischen Provider-Call.
- Pass 4–5: `canceled_by_scene_failure`, kein Provider-Job.
- Terminalstatus: `v459_terminal_required_pass_failure`, `v459_fanout_closed=true`.
- Wallet: Quellbelastung `534a3612-…` und verknüpfte Erstattung `9ce10bc9-…`, beide für denselben Run und dieselbe Szene.
