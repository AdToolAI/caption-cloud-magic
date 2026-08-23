# V459 abschliessen, danach V460 — v400 T8–T12 Contract Parity Audit (read-only)

Zwei Probleme, strikt getrennt. Kein Detector-Schwellenwert wird angefasst, solange nicht
bewiesen ist, dass ein eingefrorener Provider-Output sichtbare Lippenbewegung hat.

## Gemessener Ausgangsbefund (Szene be60d106, Run a3b5541b)

- Pass 0 (Sarah) und Pass 4 (Matthew) sind mit `sync_noop_unrecoverable` terminal
  gescheitert; Pass 5 (Kay Mark) hat um 17:50:34 die NOOP-Ladder erschöpft, während der
  Watchdog eine Sekunde vorher den Fan-out geschlossen hat. Pass 5 steht seitdem auf
  `pending` in einem terminalen Run.
- Motion-Deltas der Fehlläufe: Pass 0 = −29.04, Pass 4 = −1.29, Pass 5 = −0.78
  (NOOP-Schwelle 3.68). Alle drei **negativ** — der Output hat im gemessenen Mundband
  weniger Bewegung als der Eingang.
- Framing: `cam_dynamic` ist bei **fünf von sechs** Pässen `false`; nur Pass 2 hat einen
  dynamischen Pfad. Beide NOOP-Fehlläufe sind statisch. Das allein ist noch kein
  Vertragsbruch — es zählt, ob sich der Kopf im Turn relevant bewegt. Das muss V460 an
  den eingefrorenen Frames zeigen.
- **Bereits objektiv verletzt:** Pass 4 hat `face_share = 0.218` bei einem v400-Floor von
  0.24 und Crop-Grösse 128 px (= `minCropSizePx`-Boden) — und wurde trotzdem dispatcht.
  Sofern `face_share` heute dieselbe Semantik trägt wie im v400-Contract, ist T9 für
  Pass 4 keine Hypothese mehr. Offen bleibt nur, ob die Verletzung kausal für den NOOP war.
- Refund: Der Watchdog hat 960 **Credits** erstattet. Belastet wurden 4,50 € im
  **Euro**-Ledger (`ai_video_wallets`). Die Erstattung liegt in der falschen Kasse.

## Schritt 1 — V459 vollständig schliessen

### 1a. Fan-out-Fence vs. laufende NOOP-Ladder

Der Fence darf einen Pass nicht mehr auf `pending` zurücklassen. Aber die Behandlung
hängt daran, ob providerseitig noch etwas läuft:

```text
Pass hat KEINEN Provider-Job in flight
   → canceled_by_scene_failure, Terminalisierung, ein Refund

Pass HAT einen Provider-Job in flight
   → fan-out closed: keine weiteren Attempts
   → vorhandenen Job zuerst reconciliieren
   → erst danach terminalisieren und refunden
```

Kein „Job läuft → Pass sofort canceled → Refund". Genau diese Billing-Race soll V459
beseitigen, nicht neu erzeugen.

Vorab zu rekonstruieren: War der Ladder-Attempt von Pass 5 um 17:50:34 providerseitig
bereits terminal, als der Watchdog um 17:50:33 den Fence setzte? Der Ledger zeigt für
denselben Zeitstempel einen Job auf `stale` und einen neu erzeugten auf `dispatching` —
welcher davon providerseitig gültig war, klärt die Rekonstruktion vor dem Fix.

### 1b. Euro-Refund, gebunden an die Quell-Belastung

- Erstattet wird gegen `ai_video_wallets.balance_euros` plus `ai_video_transactions`-Zeile
  vom Typ `refund`.
- Idempotenzanker ist nicht nur (Szene, Run), sondern die konkrete Belastung:
  `source_transaction_id` = `id` der ursprünglichen Deduction, plus
  `refund_key = lipsync_refund:<run_id>:<source_transaction_id>`.
- Damit steht buchhalterisch sauber Debit −4,50 € gegen Refund +4,50 €, und ein Refund
  kann nicht gegen eine fremde Run-Belastung laufen.
- Neue Deductions bekommen `metadata.scene_id` und `metadata.run_id`.

### 1c. 402-Vertrag strukturiert, Lokalisierung nur im UI

Backend liefert `code = INSUFFICIENT_CREDITS`, `required_euros`, `available_euros`.
Die UI formuliert daraus „Guthaben reicht nicht: 4,50 € nötig, 2,13 € verfügbar"
(EN/DE/ES). Die Business-Logik hängt an keinem übersetzten String.

## Schritt 2 — Einmalige Bereinigung des bestehenden Runs, dann STOP

Für Run a3b5541b liegen bereits eine Belastung von 4,50 € (Euro) und eine Erstattung von
960 Credits (falsche Kasse) vor. Es wird genau eine der beiden Varianten ausgeführt und
im Buchungstext begründet:

1. Die 960-Credit-Erstattung exakt zurücknehmen und stattdessen 4,50 € korrekt erstatten —
   sofern sie eindeutig dieser Run-Buchung zuordenbar und sicher reversibel ist, **oder**
2. die 960 Credits bewusst als historischen Ausgleich stehen lassen und denselben Run
   **nicht** zusätzlich monetär erstatten.

Niemals still beides. Ab V459 gilt für neue Runs ausschliesslich der Euro-Ledger-Pfad.

Danach STOP: Kontostand und Buchungen verifizieren, bevor irgendetwas Weiteres läuft.

## Schritt 3 — V460: v400 T8–T12 Parity Audit, strikt READ-ONLY

Untersucht werden ausschliesslich die eingefrorenen Artefakte der Pässe 0, 4 und 5
(Preclips und Provider-Outputs liegen vor). Kein Dispatch, keine Credits, keine
Codeänderung an der Kette, kein neuer S01-Lauf.

### Messungen

1. **Contact-Sheets über den gesamten Turn**, nicht nur eine Gesichtszählung. Ein zweites
   Gesicht, das nur 20 % des Clips auftaucht, zählt trotzdem gegen T8.
2. **Mund-Y pro Sample-Frame in Provider-Space** als Serie `mouthY / 720`
   (z. B. 0.61, 0.63, 0.68, 0.74 …). Das zeigt Drift eines statischen Crops bei bewegtem
   Kopf, statt nur „ungefähr 62 %".
3. **Gesichtsgrösse absolut**: Breite px, Höhe px, Fläche / 720², Yaw-/Profil-Schätzung —
   nicht nur normalisierter `face_share`. Pass 4 (Crop 128 px, share 0.218) ist der
   interessanteste Fall.
4. **Input/Output-Vergleich unabhängig von der bestehenden Motion-Metrik**: Frame-Paare
   und, wo möglich, ein bewegungskompensierter Mund-Track. Das Gate soll gerade nicht
   von derselben Metrik abhängen, die zur Debatte steht.

Zusätzlich je Pass: bleibt der zugewiesene Sprecher durchgehend im Crop, folgt der Crop
der Kopfbewegung, bleibt der Mund über **alle** Frames vollständig im Crop.

### Auswertung — zwei Achsen, nicht drei Schubladen

| Frage | Ergebnis |
| --- | --- |
| Hat der Provider-Output sichtbar zusätzliche Mundbewegung? | JA → **B** · NEIN → **A** |
| Erfüllt der Input-Preclip v400 T8/T9? | NEIN → **C**-Verletzung(en), einzeln benannt |

A und C können gleichzeitig wahr sein. Ein Befund lautet dann z. B.: „Output = echter
NOOP (A); Preclip verletzt T8/T9 (C): Face-Share unter Floor, kein Dynamic Tracking.
Primäre Massnahme: Input-Contract wiederherstellen, Detector unverändert."

### Entscheidungslogik danach

```text
Output zeigt Lippenbewegung, Detector meldet NOOP
   → Detector/Messmethode öffnen. Erst dann Schwellen anfassen.

Output ohne Lip-Sync UND T8/T9 verletzt
   → V461: Preclip-Framing, Dynamic Tracking, Face-Gate-Parität.
     Detector bleibt eingefroren.

Output ohne Lip-Sync OBWOHL T8/T9 vollständig eingehalten
   → Provider-Payload und Provider-Verhalten als nächste Ebene.
     Nicht weiter am Preclip drehen.
```

## Freeze-Status

- Schritt 1 und 2 liegen innerhalb der erlaubten Änderungen (Determinismus,
  Refund-Korrektur, Copy).
- Schritt 3 ist read-only und braucht keinen Unfreeze.
- Ein Unfreeze wird erst nach dem Befund beantragt, mit dem Scope, den der Befund
  benennt — Preclip-Framing und Dynamic Tracking eingeschlossen, Detector-Schwellen
  ausschliesslich im Fall B.
