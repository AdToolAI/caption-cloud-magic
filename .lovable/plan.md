# V435 Phase 2 — Samuel A/B/C/D Cross-Test (startet nach deinem GO)

Verstanden: Der Reset wird von dir als Owner manuell ausgelöst, genau einmal, ohne weitere Änderungen an der Szene und ohne zweiten Retry. Ich fasse die Szene bis zu deinem GO nicht an.

**So findest du die Szene** (dein erster Screenshot zeigte ein frisch angelegtes, leeres Projekt — deshalb "0 Scenes"):
- Konto: `bestofproducts4u@gmail.com`
- Projekt: **v431-g322-resmoke** (ID `035273d7-ae9b-44e0-89e7-f9e28703530d`)
- Direkt öffnen: `https://useadtool.ai/video-composer?projectId=035273d7-ae9b-44e0-89e7-f9e28703530d`
- Zielszene: **S11 — die letzte Szene in der Liste** (`e658509d-…`, order_index 10, Status „Generated", die mit den vier Charakteren auf der Dachterrasse). Nicht S08/S09/S10 — das sind fehlgeschlagene Szenen und nicht Teil dieses Gates.
- Dort genau einmal „Reset & retry lip-sync" klicken, danach nichts weiter ändern.

Stand jetzt: `v434_artifact_pins` enthält weiterhin **0 Zeilen** — der Lauf hat also noch keine Evidenz erzeugt. Die Instrumentierung (Preclip-Pin + Provider-Output-Pin inkl. `attempt`/`purpose`) ist deployt und schreibt die Zeilen automatisch, sobald der Lauf durchläuft.

## Was nach GO passiert

**1. Phase-1-Abnahme (read-only)**
- Pins der neuen `run_id`/`generation` auslesen und prüfen: pro Pass genau ein `preclip` und ein `provider-output`, mit immutabler Objekt-Key, `sha256`, `byte_size`, `attempt`.
- Samuel T2 (Pass 2) und T6 (Pass 3) über die characterId `483f9cdc…` und den gelockten Slot 1 erneut strukturell zuordnen — kein Namens-Matching.
- Jede gepinnte Datei erneut laden und den Hash gegenprüfen. Jede Abweichung führt zur Verweigerung dieser Zelle, nicht zu einer Messung.
- Fehlt eine Pin-Sorte, endet der Gate hier mit BLOCKED statt mit einem Ersatzweg über mutable Artefakte.

**2. A/B/C/D-Matrix auf exakt diesen Pins**

| Zelle | Video-Input | Audio-Input |
|---|---|---|
| A | Samuel T2 Preclip-Pin | T2-Audio (Baseline-Reproduktion) |
| B | Samuel T2 Preclip-Pin | Audio des erfolgreichen Samuel-Turns (T6) |
| C | Preclip-Pin des erfolgreichen Turns (T6) | T2-Audio |
| D | Samuel T2 Preclip-Pin | T2-Audio, zweiter Provider-Versuch |

Pro Zelle festgehalten: Input-/Output-Keys mit Hash, tatsächlich verwendete geometrie-gekoppelte Mund-ROI, MAD-Ratio, Alt-Metrik ΔMean (nur Telemetrie), Provider-Job-/Attempt-ID, Mundstreifen-Kontaktbogen, menschliches Label. Alle Cross-Test-Ausgaben werden mit `purpose='calibration'` und gesetzter `cell` gepinnt, damit sie nie mit Produktionsevidenz verwechselt werden.

**3. Auswertung nach vordeklarierten Regeln** (bereits im Harness verankert, wird nicht nachträglich angepasst)
- A ≠ D → PROVIDER-SPORADIC, hat Vorrang vor allen Input-Schlüssen.
- A+B no-op, C Bewegung → PRECLIP / Face-Window.
- A+C no-op, B Bewegung → AUDIO/TURN.
- Alles andere oder ein unklares Label → UNDECIDED.

**4. Kalibrierung bleibt nicht-autoritativ**
Neue Samples werden als reproduzierbar erfasst, aber es wird kein Schwellwert abgeleitet und kein Produktions-Gate umgestellt, solange nicht mindestens drei saubere Samples pro Klasse über mehrere Sprecher, Cropgrößen und Turn-Längen vorliegen. MAD-Ratio bleibt `telemetry_only`.

## Grenzen dieses Gates

Keine Änderung an Gate-Logik, Schwellwerten, Provider-Auswahl, Retry-Stufen, Dispatch, Mux, State-Machine oder Continuity. Kein Frontend-Publish. Die einzigen Aufrufe an den Provider sind die vier Zellen — falls dafür ein Key im Sandbox-Kontext fehlt, melde ich das offen, statt Ergebnisse zu schätzen.

## Ergebnis

Ein Urteil in der Form:
`V435 = PASS — PHASE-1 PINS COMPLETE + PRIMARY CAUSE <PRECLIP|AUDIO/TURN|PROVIDER-SPORADIC|UNDECIDED>, MAD-RATIO EVIDENCE <summary>, CALIBRATION STILL NON-AUTHORITATIVE`
oder ein ehrliches BLOCKED mit Begründung.
