# V543 — 1:1-Abgleich Golden Run v400 gegen den aktuellen Lauf (read-only, dann ein Gate)

## Was dieser Lauf tatsächlich gezeigt hat

Szene `7aa7fc93…`, Plate-Generation 7, Run `3fdf7044…`, 4 Turns / 2 Sprecher:

- Alle **4 Sync-Passes wurden dispatcht und vom Provider mit `succeeded` beendet**.
  Es gab kein Preflight-Gate, keinen Abbruch, kein V542-Recovery — der Lauf ist
  vollständig durchgelaufen und wurde gemuxt (`clip_status = ready`).
- **Jeder einzelne Pass wurde als `noop` gemessen** (`motion_measure_done`,
  `verdict: noop`, `measurement_status: measured`, Pass 0/1/2/3).
  „noop" heißt: der Provider-Output ist identisch mit dem Input — kein Lip-Sync.
- V541 hat das korrekt als `v541_needs_review` /
  `reason: v500_noop_unverified_anchor` protokolliert — aber nur als Telemetrie.
  Die Szene wurde trotzdem als Erfolg abgeschlossen. Genau das ist das Video,
  das du gesehen hast: fertig, mit Voiceover, ohne Mundbewegung.
- Der Watchdog meldete zusätzlich `mouth_over_frame = 1.18 / 1.19 / 1.81` und
  `anchor = unknown`. Ein Wert > 1 bedeutet: die gemessene Mund-ROI ist **größer
  als der Frame** des Preclips.

Das ist eine andere Fehlerklasse als alles der letzten Wochen: nicht mehr
„blockiert vor dem Provider", sondern „läuft durch und liefert nichts".

## Wie sich das zu v400 verhält (belegte Punkte)

Der Golden Run v400 (`c934a823…`, 03.08., 4 Sprecher) ist dokumentiert mit:

| Merkmal | Golden Run v400 | Heutiger Lauf Gen 7 |
|---|---|---|
| `retry_variant` | `bbox-url-pro` | `bbox-url-pro` (identisch) |
| `preclip_used` | true | true |
| Pässe = Turns | 4 = 4 | 4 = 4 |
| Provider-Status | succeeded | succeeded |
| Face-Share im Crop | 0.252 – 0.400 | **unbekannt, nicht persistiert** |
| Face-Größe | ca. 182 – 288 px | **unbekannt** |
| Mund im Crop | vollständig enthalten | `mouth_over_frame` 1.18 – 1.81 |
| Ergebnis | sichtbarer Lip-Sync | `noop` in allen 4 Pässen |

Die Kette selbst (Preclip → Provider → Reprojektion → Mux) ist also nicht
gebrochen. Der Unterschied liegt in der **Crop-Geometrie, die wir an Sync.so
schicken** — und darin, dass wir heute die dafür entscheidenden Zahlen nicht
mehr festhalten, während der Golden Run sie hat.

## Gate 1 — Der harte 1:1-Abgleich (read-only, keine Codeänderung)

Nicht nach Versionsnamen, sondern an den echten Artefakten dieses Laufs:

1. Die vier Gen-7-Preclips und die vier Provider-Outputs herunterladen und
   messen: Frame-Größe, Gesichtsbox, Face-Share, Face-Höhe in Pixeln,
   Mundposition relativ zum Frame.
2. Dieselben Messungen für die Golden-Run-Artefakte (`c934a823…`, Gen 1).
3. Eine Tabelle Pass-für-Pass: v400-Wert, heutiger Wert, Delta, und ob der Wert
   innerhalb des v400-Korridors liegt (Face-Share 0.24–0.40, Face-Höhe ≥ 144 px,
   Mund vollständig im Frame).
4. Payload-Diff: das an Sync.so gesendete Objekt beider Läufe Feld für Feld
   (`sync_mode`, `input_space`, `asd_mode`, `asd_auto_detect`, Bounding-Boxes,
   Audio-Länge gegen Clip-Länge).
5. Prüfen, ob `mouth_over_frame > 1` eine echte Geometrie ist oder ein
   Messartefakt im Raum-Mismatch (Clip-Raum vs. Plate-Raum).

**Ergebnis:** eine belegte Aussage, welcher konkrete Zahlenwert den Unterschied
zwischen „Golden Run trifft" und „heute noop" erklärt. Ohne diese Messung wird
nichts geändert.

## Gate 2 — Ehrlichkeit erzwingen (kleiner Eingriff, sofort wirksam)

Unabhängig vom Messergebnis darf ein Lauf, in dem **alle** Pässe als `noop`
gemessen wurden, nicht als fertige Szene ausgeliefert werden. V541 kennt die
Wahrheit bereits, hat aber kein Veto.

- Bei `noop` mit `measurement_status = measured` (also bewiesen, nicht nur
  ungemessen) wird der Pass terminal als fehlgeschlagen behandelt statt als
  Erfolg — mit dem bestehenden, idempotenten Refund-Pfad.
- `motion_unverified` (nicht messbar) bleibt unverändert Durchlauf, wie in v443
  festgelegt.
- Keine Änderung an Schwellen, Provider, Retries, Preisen, Locks, Webhook-
  Antwortformen oder der Zustandsmaschine.

Damit endet die Klasse „bezahltes Video ohne Lip-Sync, das als Erfolg gilt".

## Gate 3 — Geometrie auf den v400-Korridor zurückführen

Erst nach Gate 1, und nur gegen den dort gemessenen Beleg: die Crop-Berechnung
so anpassen, dass die vier Zahlen des Golden Runs wieder erreicht werden
(Face-Share, Face-Höhe, Mund vollständig im Frame, Boxen im Clip-Raum). Kein
Umbau der Kette, keine neuen Gates — nur die Rückführung der Eingangsgeometrie
in den Korridor, in dem Sync.so nachweislich funktioniert hat.

## Technische Details

- Belege: `composer_callback_observations` für Szene `7aa7fc93…`, Gen 7,
  20:12–20:18 UTC — 4× `motion_measure_done/noop`, 6× `v541_needs_review`,
  `apply_not_confirmed` mit `duplicate_callback` (Watchdog-Rauschen, nicht
  ursächlich).
- Jobs: `composer_pipeline_jobs`, Gen 7 — 1× `base_video`, 4× `sync_segment`
  (alle `succeeded`), 1× `audio_mux` (`succeeded`).
- Gate 2 betrifft ausschließlich `sync-so-webhook` (Erfolgspfad) und
  `_shared/v541-truth-gate.ts`; `compose-dialog-segments` bleibt unangetastet.
- Golden-Run-Referenz: `docs/lipsync-golden-run-v400.md`, Errata in
  `docs/lipsync-pipeline-v400-errata.md`.

## Nicht Teil dieses Plans

Kein Rollback der Kette, keine Provider-Änderung, keine Änderung an V536/V537/
FA-4/V542, keine Frontend-Veröffentlichung, kein bezahlter Render ohne deine
ausdrückliche Freigabe.
