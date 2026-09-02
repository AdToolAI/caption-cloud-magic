# Lip-Sync: v400-Spezifikation vs. heutiger Stand — Befund und Reparaturplan

## Kurzfassung

Die Kette ist nicht kaputt — sie ist **zu eng geworden**. Einzelsprecher-Szenen
laufen heute sauber durch. Alles ab zwei bis vier Sprechern scheitert, und zwar
nie am Provider, sondern immer **vor** dem Sync.so-Aufruf, an Gates, die es in
v400 nicht gab.

Produktionsdaten der letzten 24 Stunden:

| Szene | Sprecher-Pässe | Ergebnis |
|---|---|---|
| 5cf3e6e7 | 1 | fertig |
| afad496f | 1 | fertig |
| acd1679a | 1 | fertig |
| e31a4ce0 | 1 | fertig |
| ecb95d2b | – | `fa4_p0_turn_pass_mismatch` |
| 7aa7fc93 | 4 | `dynamic_mouth_crop_infeasible` |
| 67b392b1 | 6 | `face_repair_identity_unresolved` |

Szene 7aa7fc93 starb 20 Sekunden nach dem Fanout, im Preflight von Pass 0 — es
wurde nie ein einziger Provider-Job erzeugt. Credits wurden korrekt erstattet.

## Die vier Abweichungen, die die Szenen töten

### 1. Die Messgrundlage hat sich verschoben (bricht den v400-Kernvertrag)

v400 sagt: Geometrie wird **ausschließlich** auf `reference_image_url` gemessen.
Genau das war die Ursache des Juli-Bugs und deshalb als Invariante eingefroren.

Ab drei Sprechern misst die Kette heute nicht mehr auf dem Anker, sondern auf
**Stills aus dem generierten Plate-Video** (V524/V525/V526/V528/V530). Damit muss
nicht mehr nur der Anker sauber sein, sondern zusätzlich das i2v-Ergebnis: jedes
Gesicht muss in einem einzigen Frame biometrisch auflösbar sein, bei <1 %
Seitenverhältnis-Drift. Jede Kamerabewegung, jede Kopfdrehung im Plate blockiert
jetzt den Dispatch — ein Szenario, das v400 konstruktiv nie sehen konnte.

Genau hier stirbt 67b392b1 (`face_repair_identity_unresolved_pass_5_speaker_Kay Mark`).

### 2. Die Plate-Auflösung unterschreitet die Spezifikation

v400 T4 fordert **mindestens 1080p**, ausdrücklich mit der Begründung „darunter
sind Gesichter zu klein für den Preclip".

Alle betroffenen Szenen laufen mit `talking_head_resolution = 720p` bei 9:16. Die
extrahierten Stills messen 656 × 1406 px. Bei vier Personen im Bild bleiben pro
Gesicht wenige Dutzend Pixel — der V461-Face-Share-Floor von 24 % und der
144-px-Größen-Floor sind damit rein rechnerisch nicht mehr erreichbar. Genau das
ist `dynamic_mouth_crop_infeasible` bei 7aa7fc93.

Bei einem Sprecher füllt das Gesicht den Frame — deshalb funktionieren
Einzelsprecher-Szenen weiterhin.

### 3. Zwei zusätzliche, unabhängige Fail-Closed-Gates vor dem Dispatch

v400 hatte **ein** Face-Gate (Share ≥ 24 %, Größe ≥ 144 px, Mund nicht
angeschnitten). Heute müssen zwei voneinander unabhängige Gates bestehen:

- `v461-face-gate.ts` — die v400-Schwellen, unverändert, aber jetzt gegen **jeden**
  Keyframe des dynamischen Kamerapfads (V452) geprüft statt gegen einen statischen
  Crop. Ein einziger Frame, in dem das Mundband die Crop-Kante streift, killt die Szene.
- `syncso-face-gate.ts` — ein zusätzlicher Rekognition-Live-Check mit den neuen
  Hard-Fails `not_at_coord` und `multiple_faces`. Ein korrekt sichtbares Gesicht
  knapp außerhalb der 15-%-Toleranz oder ein Statist im Hintergrund reicht zum Abbruch.

Dazu kommen die neuen Terminalcodes aus V519/V520/V523/V524/V530/V534/V536, die es
in v400 alle nicht gab.

### 4. FA-4 / V537: Turn-IDs gehen weiterhin verloren

`ecb95d2b` scheitert an `fa4_p0_turn_pass_mismatch` — dasselbe Muster wie bei
N2-02: nur die erste `turnId` überlebt den Weg Dialog-Studio → `audio_plan` →
Dispatch. V537 setzt den Zaun im Backend, der Client schreibt `audio_plan` aber
weiterhin unbedingt zurück und kann den serverseitig gebauten Plan überschreiben.

## Was NICHT das Problem ist

- Provider (HappyHorse/Sync.so) — es wurde in keinem Fehlerfall überhaupt ein Job erzeugt.
- Der Run-Guard, die Run-Identität, der Assignment-Lock, die Reprojektion, der Mux.
- V536 — der Code ist korrekt, er meldet nur eine real unmögliche Crop-Geometrie.
- Credits — die Refunds greifen idempotent und korrekt.

## Vorgeschlagene Reparatur (in dieser Reihenfolge, je ein Gate)

### Gate A — Auflösungs-Vertrag wiederherstellen (größter Hebel, kleinster Eingriff)

Lip-Sync-Szenen mit ≥ 2 Sprechern erzwingen 1080p-Plates, wie v400 T4 es verlangt.
Bei 9:16 und vier Personen zusätzlich prüfen, ob der Face-Share überhaupt
erreichbar ist, und das dem Nutzer **vor** dem kostenpflichtigen Render sagen statt
20 Sekunden nach dem Fanout. Kein Gate wird aufgeweicht — die Eingangsqualität wird
auf das Niveau gehoben, für das die Gates ausgelegt sind.

### Gate B — Anker-Kohärenz für die Identität wiederherstellen

Die Identitätsauflösung ab drei Sprechern kehrt zur v400-Invariante zurück: Anker
ist die Autorität, Plate-Stills nur noch Telemetrie/Plausibilisierung. Die
V524–V530-Kette bleibt im Code, verliert aber ihr Veto. Damit fällt der gesamte
Fehlercluster `incomplete_registration` / `identity_unresolved` /
`dims_incoherent` weg.

### Gate C — Doppelgate entschärfen

`syncso-face-gate.ts` wird von Fail-Closed auf Telemetrie zurückgestuft, solange
`v461-face-gate.ts` (die echten v400-Schwellen) besteht. `multiple_faces` bleibt
nur dann ein Hard-Fail, wenn das zusätzliche Gesicht größer ist als das Zielgesicht.

### Gate D — FA-4-Turn-IDs endgültig schließen

Der Client hört auf, `audio_plan` unbedingt zurückzuschreiben; fehlende Turn-IDs
werden an genau einer kanonischen Grenze mit UUIDs aufgefüllt. FA-4 selbst wird
nicht aufgeweicht.

## Technische Details

- Speaker-Count-Verzweigung: `compose-dialog-segments/index.ts`,
  `v523NeedsIdentity = speakers.length >= 3 && !!plateDims` (~Zeile 4729); alle
  V523/V524/V530-Aufrufe hängen daran. Ein- und Zweisprecher nutzen weiterhin den
  v278-Router in `plateFaceSlotRouter.ts`.
- Schwellen: `v461-face-gate.ts:39` (`0.24`), `:41` (`144`) — unverändert v400-konform.
- Watchdog-TTL ist heute 25 min (`lipsync-watchdog/index.ts:70`) statt der in v400
  dokumentierten 6 min; nur der Audio-Mux-Stall nutzt noch 6 min. Kosmetisch, aber
  erklärt die langen Hänger im UI.
- Reprojektions-Maske: Code führt `opaqueCorePct: 30` / `transparentEdgePct: 78`,
  die Spezifikation nennt 55–63 % Radius. Zu klären, welche Zahl die gültige ist.

## Nicht Teil dieses Plans

Kein Deploy, keine Provider-Änderung, keine Preis-/Refund-Logik, keine Änderung an
V536, V537, FA-4-Semantik oder der Zustandsmaschine.
