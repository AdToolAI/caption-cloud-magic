# V500 — v400 Lip-Sync Core Restoration

Kein Repository-Rollback. v400 wird als **autoritative Spezifikation** für die
lip-sync-semantischen Schritte T8–T13 wiederhergestellt; die moderne Safety
Shell (Fencing, Locks, Refund, Webhooks, Recovery, Telemetrie) bleibt
unverändert erhalten.

## Vertrag

> Alle lip-sync-semantischen Schritte T8–T13 werden gegen v400 rekonstruiert.
> Spätere Änderungen bleiben nur erhalten, wenn sie nachweislich denselben
> Vertrag bewahren oder ausschließlich Orchestrierung/Sicherheit betreffen.

Zwei Schichten, strikt getrennt:

```text
Schicht 1 — v400 Engine (semantisch, wird restauriert)
  Anchor → Plate → Face-Track → Mouth-priority Preclip → Face Gate
  → Sync-3 → Passthrough Gate → Reprojection → Mux

Schicht 2 — Safety Shell (bleibt wie heute)
  Run-Fencing · Locks/Leases · Ledger/Refund · Webhook-Idempotenz
  · Output-Pinning · Zombie-Recovery · Watchdog · Fan-out · Telemetrie
```

Die Shell darf die Engine absichern, aber ihre Geometrie und ihre
Erfolgsdefinition nicht verändern.

## Belegter Ist-Zustand (verifiziert)

- `compute-mouth-centered-crop.ts` zentriert den Mund auf **0.50** der
  Preclip-Höhe. Ein 0.62-Target existiert dort nicht.
- `MOUTH_TARGET_Y = 0.62` ist in `dynamic-camera-path.ts` deklariert und wird
  **nirgends verwendet** (einziger Treffer im gesamten Backend ist die
  Deklaration selbst).
- Der Camera Path plant ausschließlich über **Face-Boxen**; das gemessene
  Mouth-Landmark geht nicht in die Trajektorie ein. Bei Travel unter
  `STATIC_TRAVEL_EPSILON = 0.01` fällt der Pfad auf **einen** Keyframe zurück
  (`static_equivalent`) — genau das Muster aus V476.
- V477 (dieser Tag) liefert die Landmark-Autorität bereits an den Crop; die
  Ratio-Kompensation 0.88 ist zurückgenommen. Damit ist die Eingangsseite von
  T8 gesund — die Ziel-Geometrie ist es noch nicht.

## Umfang je Schritt

| Schritt | v400 | Heute | V500 |
| --- | --- | --- | --- |
| T8 Preclip-Geometrie | Mund ~62 % Höhe | 0.50-Zentrierung, real 0.489–0.590 | v400 wiederherstellen |
| T8 Mouth-Quelle | echte Messung | Landmark (seit V477) | beibehalten |
| T8 Camera Path | folgt Kopf | faktisch 1 Keyframe | v400 wiederherstellen |
| T8 One-Face-Preclip | Pflicht | vorhanden | prüfen, beibehalten |
| T9 Face Gate | 0.24 / 144 px / Mund ganz | V461 | beibehalten (Äquivalenz beweisen) |
| T10 Sync-Payload | Golden | erweitert (ASD pro Frame u. a.) | gegen Golden diffen |
| T11 Run Guard | vorhanden | gehärtet | heutige Version behalten |
| T12 Outcome Gate | Passthrough-Erkennung | Klassifikator mit Bändern | v400-Semantik |
| T13 Reprojection/Mux | v400 | — | Parität prüfen |

## Gates

**V500-A — Golden-Contract-Extraktion (READ-ONLY).**
Aus dem bekannten funktionierenden Homepage-Lauf (Szene
`c934a823-47de-49b7-a62e-a116b49ca3b2`) werden die v400-Ist-Werte je Pass
extrahiert und als Golden-Fixture eingefroren: Mundhöhe im Preclip, Anzahl
Camera-Path-Keyframes und Travel, Face-Share/Face-Size, exakter Sync-Payload,
Outcome-Entscheidung. Ergebnis ist die Messlatte — keine Annahmen.

**V500-B — T8 Restoration (Geometrie).**
Mund-Zielhöhe 0.62 statt 0.50 im Preclip-Crop; das gemessene Landmark (V477)
wird auch zum Träger der Camera-Path-Trajektorie, damit der Pfad dem Kopf folgt
statt auf einen Keyframe zu kollabieren. Der Übergang ist versioniert und über
das Golden-Fixture abgesichert, nicht frei kalibriert.

**V500-C — T12 Semantik-Rückbau.**
Das Outcome Gate beantwortet wieder genau eine Frage: „Ist der Output
nachweislich Passthrough?“ Drei Ausgänge — verändert → accept, beweisbar
identisch → fail, nicht eindeutig messbar → unknown. `unknown` wird nie zu
einem NOOP terminalisiert. Die heutige Messgröße bleibt nur, wenn sie auf dem
Golden-Fixture 4/4 korrekt entscheidet.

**V500-D — T9/T10 Äquivalenz-Beweis.**
Face Gate und Sync-Payload werden gegen den Golden-Contract gediffed. Was den
v400-Vertrag bewahrt, bleibt; was ihn verändert und sich nicht rechtfertigen
lässt, fliegt raus.

**V500-E — Frozen Replay + Abnahme.**
Zuerst Golden 4/4 offline: alle T8–T13-Contracts PASS, kein falscher NOOP.
Danach S01 Frozen-Replay mit echten Landmarks, bewegtem Pfad und Mund ~62 %,
Provider- und Verdict-Geometrie konsistent. Erst wenn beides sauber ist, ein
neuer Providerlauf — als separates, ausdrücklich freigegebenes Canary.

## Technische Details

- Berührte Engine-Dateien: `_shared/compute-mouth-centered-crop.ts`,
  `_shared/dynamic-camera-path.ts`, `_shared/pass-face-preclip.ts`,
  `_shared/v456-roi-contract.ts`, `_shared/v471-mouth-roi.ts`,
  `_shared/v465-verdict.ts`, `sync-so-webhook`, `compose-dialog-segments`.
- Nicht angefasst: Fencing-, Lock-, Ledger-, Refund-, Watchdog-, Recovery- und
  Idempotenz-Pfade (`v459_*`, `v461-input-fingerprint`, Job-/Attempt-Guards).
- Jede Geometrieänderung wird über die Golden-Fixture-Tests belegt; Offline-
  Replays laufen als Deno-Tests plus Report unter `docs/v500-*.md`.
- V477 und V478 werden nicht einzeln weitergepatcht; V478 geht in V500-B auf.

## Reihenfolge

V500-A → V500-B → V500-C → V500-D → V500-E, nach jedem Gate STOP mit Bericht.
