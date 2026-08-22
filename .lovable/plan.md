# V450 — NOOP-Retry stirbt am V445-Geometrie-Guard

## Was tatsächlich passiert ist (belegt aus der Szene)

Szene `be60d106…` (Projekt V449, Rooftop-Test) steht auf `clip_status = ready`,
`lip_sync_status = failed`, `clip_error = v204_preclip_required`.

Die Kette lief weiter als bisher:

1. Plate ist fertig, alle **vier** Gesichter wurden identitätsscharf zugeordnet
   (`matchSource = gemini-identity`, Confidence 1.0 für Sarah, Kay, Matthew, Samuel).
2. Pass 0 (Sarah) wurde regulär mit Preclip an den Provider geschickt.
3. Das Provider-Ergebnis wurde als **NOOP** gemessen
   (`delta_mean = -63.4` gegen Schwelle 3.68) → automatische NOOP-Eskalation
   auf Variante `coords-pro-box`.
4. Beim Retry hat der Pass **keinen Preclip mehr** (`preclip_url = null`,
   `preclip_crop = null`, aber `preclip_from_bbox` und der V434-Preclip-Pin sind
   noch da) → der v204-Guard verweigert korrekt den Multi-Speaker-Dispatch ohne
   Preclip → Szene terminal fehlgeschlagen.

## Ursache

Zwei Verträge widersprechen sich seit V445:

- **v404/v407 (NOOP-Retry):** Ein NOOP-Retry MUSS exakt denselben Preclip,
  dasselbe Audio und dieselbe Box wiederverwenden ("frozen wire"). Deshalb ist
  das Neu-Rendern eines Preclips bei `noop_auto_escalation` ausdrücklich
  gesperrt (`v161PreclipEligible` endet mit `body?.noop_auto_escalation !== true`).
- **V445 (Geometrie-Kohärenz):** Wenn die Signatur der gecachten Crop-Box nicht
  exakt zur neu gemessenen finalen Plate-Box passt, wird der gecachte Preclip
  verworfen (`preclip_url = null`, `preclip_crop = null`), damit er neu
  gerendert wird.

Beim NOOP-Retry greift V445, wirft den Preclip weg — und das Neu-Rendern ist im
selben Lauf verboten. Ergebnis ist ein garantierter Hard-Fail. Das trifft jede
Mehrsprecher-Szene, die einmal in die NOOP-Eskalation läuft.

## Fix (minimal, exakt eine Verzweigung)

In `supabase/functions/compose-dialog-segments/index.ts`:

1. Den V445-Cache-Drop **nicht** ausführen, wenn `body.noop_auto_escalation === true`
   ist. Beim NOOP-Retry ist der eingefrorene Snapshot die Authority; die
   Geometrie darf nicht neu gemessen werden. Statt zu verwerfen wird die
   Abweichung nur als Telemetrie geloggt
   (`v450_noop_retry_geometry_drift_ignored` mit beiden Box-Signaturen).
2. Zweiter Riegel gegen dieselbe Klasse von Fehlern: Wenn der Preclip in einem
   Multi-Speaker-Pass fehlt **und** das Neu-Rendern gesperrt ist, darf der Pass
   nicht mit `v204_preclip_required` die ganze Szene killen, sondern muss den
   Preclip aus dem V434-Pin bzw. `_v105_probe.payload_video_url` des Passes
   rekonstruieren. Nur wenn auch das fehlt, bleibt der bestehende
   Fail-Closed-Pfad inklusive idempotentem Refund unverändert.

Nicht angefasst: Gates, Schwellenwerte, Framing, Kamerapfad, Maskengeometrie,
Provider-Liste, Zustandsmaschine, Assignment-Lock, Refund-Logik.

## Freeze-Einordnung

Der Lip-Sync-Freeze (v400) verbietet Änderungen an Gates und Retry-Mechanik.
Dieser Fix ändert weder Schwelle noch Gate-Logik, sondern behebt einen
deterministischen Widerspruch zwischen zwei bestehenden Verträgen (v404/v407 vs.
V445), der jeden NOOP-Retry unmöglich macht. Er braucht deine ausdrückliche
Freigabe als eng begrenzte Ausnahme.

## Verifikation in diesem Gate

- Neuer Unit-Test: NOOP-Retry mit abweichender Box-Signatur behält
  `preclip_url`/`preclip_crop`; Fresh-Dispatch verwirft sie weiterhin.
- Bestehende Deno- und Vitest-Suites müssen grün bleiben.
- Deploy ausschließlich von `compose-dialog-segments`.
- **Kein** Render, kein S01/S11-Rerender in diesem Gate.

## Offener Punkt (bewusst nicht in diesem Gate)

Das `delta_mean = -63.4` ist auffällig stark negativ — der Provider-Output
bewegt sich messbar weniger als der Preclip. Das kann ein echter Provider-NOOP
sein oder ein Messfehler durch abweichende Crop-Geometrie. Das gehört in ein
eigenes, nachgelagertes Read-Only-Diagnose-Gate, sobald der Retry-Pfad
überhaupt wieder durchläuft.
