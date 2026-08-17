# FA-4/P1-B — Root Cause + Fix Contract (read-only Befund)

Scope: ausschließlich der Plate-Stage-Blocker `compose-video-clips`.
Kein Code, keine Migration, kein Deploy, kein Render in diesem Schritt.

## 1. Befundlage und Beweismittel

Die Edge-Logs des Runs vom 2026-08-17 10:40 UTC sind nicht mehr abrufbar
(Log-Retention im Analytics-Store reicht aktuell nur ~10 Minuten zurück; der
Befund `ERROR CPU Time exceeded` stammt aus dem Audit-Checkpoint desselben
Tages und bleibt gültig). Die Rekonstruktion stützt sich deshalb auf zwei
belastbare Quellen:

- die persistierte Attempt-Historie in
  `composer_scenes.audio_plan.twoshot.anchor_attempts` / `anchor_face_audit`
  der Szene S09 `ece6a71c-…`,
- den Code-Pfad von `compose-video-clips/index.ts` und den beteiligten
  `_shared`-Helfern.

## 2. Anchor-Attempts des fehlgeschlagenen Runs (aus DB, nicht rekonstruiert)

| # | Zeit (UTC) | Modus | Ergebnis | Verworfen weil |
|---|---|---|---|---|
| 1 | 10:40:31.657 | normal | faces 4, humans 3, identity `clone` | `Sarah Dusatko` dupliziert, `Samuel Dusatko` fehlt → strict retry |
| 2 | 10:40:56.271 | strict | faces 4, humans 4, identity `ok` | identitätsseitig akzeptiert, aber Min-Face-Gate schlug an (`suggestion: tight_grid`) → framing retry |
| 3 | 10:41:25.548 | framing-retry | faces 4, humans 4, `minFaceRatio 0.146`, `sizeOk true` | **akzeptiert** |

Abstände: Attempt 1→2 = 24,6 s, 2→3 = 29,3 s Wall-Time.

`anchor_face_audit` ist mit `ok: true`, `version: 15`, `retried: true` um
10:41:25 persistiert, `reference_image_url` zeigt auf
`…/scene-anchors/ece6a71c-…-fa4d467a3539.png`.
**Der Anchor war also erfolgreich gepinnt und ist bis heute in der DB.**

Was FEHLT: `audio_plan.twoshot.anchor_identity` und
`dialog_shots.anchor_face_layout` / `plate_identity`.
Die Szene endete mit `clip_error = watchdog_no_prediction_id (refunded €6.30)`.

**Todeszeitpunkt liegt damit eindeutig zwischen dem Anchor-Pin-Write und dem
v274-Persist**, also im Rekognition-Identity-Block — nach dem Anchor,
vor jedem Provider-Dispatch.

## 3. Was CPU verbraucht — und was nur wartet

Netzwerk-/I/O-gebunden (praktisch kein CPU im Worker):

- `compose-scene-anchor`-Aufrufe (Nano Banana 2) — reine `fetch`-Wartezeit,
  erklärt die 25–30 s pro Attempt.
- `countFacesInImage`, `countHumansInImage`, `auditAnchorIdentity` — diese
  übergeben **URLs** an das Lovable-AI-Gateway, laden das Bild nicht in den
  Worker.
- DB-Reads/Writes.

CPU-gebunden im Worker — und ausschließlich in den AWS-Pfaden:

- `_shared/resolveIdentityViaRekognition.ts` und
  `_shared/face-detect-mediapipe.ts` laden das Bild als `arrayBuffer` in den
  Worker und encodieren es Byte-für-Byte nach Base64:
  ```ts
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
  ```
  Das ist O(n) mit String-Konkatenation pro Byte über ein mehrere MB großes
  PNG — der einzige nennenswerte CPU-Verbraucher der gesamten Stage.
- Zusätzlich `probeImageDims` (JPEG-Scan-Schleife) und `optimalAssignment`,
  beide vernachlässigbar gegenüber dem Base64-Encoding.

## 4. Die eigentliche Ursache: derselbe Anchor wird N-fach neu encodiert

In `resolveIdentityViaRekognition` wird der Anchor **einmal geladen**, aber
`compareOnePortrait` baut den Payload pro Charakter neu:

```ts
SourceImage: { Bytes: bytesToBase64(portraitBytes) },
TargetImage: { Bytes: bytesToBase64(anchorBytes) },   // ← identisch für jeden Charakter
```

Aufgerufen in einer Schleife über `params.characters`.

Base64-Encodings des VOLLEN Anchors in diesem Run:

| Stelle | Anzahl |
|---|---|
| Min-Face-Gate `detectFacesMediaPipe` (Attempt 2) | 1 |
| Min-Face-Recheck `detectFacesMediaPipe` (Attempt 3) | 1 |
| `detectFacesOnAnchor` (v274) | 1 |
| `compareOnePortrait` — **1× pro Sprecher** | **4** |
| Portraits (je 1×) | 4 |

= 7 Voll-Anchor-Encodings + 4 Portrait-Encodings, davon 4 Anchor-Encodings
rein redundant. Das CPU-Budget des Workers ist genau in diesem Block
erschöpft — konsistent mit dem fehlenden `anchor_identity`-Write.

**Skalierung:** die Compare-Schleife ist linear in N. FA-3 (N=1) und N=2 sind
unterhalb des Budgets geblieben, N=4 nicht. Das Problem ist damit **nicht
N=4-spezifisch, sondern skaliert mit der Zahl der Sprecher und zusätzlich mit
der Zahl der Anchor-Attempts** (jeder akzeptierte Framing-Retry fügt einen
weiteren Voll-Encode hinzu). N≥3 ist ab jetzt strukturell gefährdet.

## 5. Arbeitet die Retry-Schleife doppelt?

Die Anchor-Ladder selbst (attempt-1 → strict → face-lock → framing) wiederholt
**fachlich notwendige** Arbeit: jeder Attempt erzeugt ein neues Bild, das neu
auditiert werden muss. Hier ist nichts unnötig.

Redundant ist ausschließlich:

- der wiederholte Base64-Encode **desselben** Anchors innerhalb einer
  einzigen v274-Auflösung (4× statt 1×),
- der zweite `detectFacesMediaPipe`-Encode des final akzeptierten Anchors,
  dessen Bytes unmittelbar danach in v274 erneut geladen und encodiert werden.

Beides ist deterministisch wiederverwendbar: gleiche URL ⇒ gleiche Bytes ⇒
gleicher Base64-String. Es gibt keine Semantik, die pro Aufruf ein frisches
Encoding verlangt.

## 6. Liegt zwischen Anchor-Pin und Dispatch noch teure Arbeit?

Ja, aber nur die v274-Kette (Rekognition-Detect + N Compares) plus
`buildAnchorLayoutFromV274` (rein rechnerisch, billig), DB-Writes und danach
der HappyHorse-Dispatch. Der Anchor-Pin ist damit **der letzte erfolgreich
persistierte Zustand vor dem CPU-Tod**.

## 7. Existiert bereits ein sauberer Phase Boundary?

Ja, und er ist heute schon implementiert:

- Der Anchor-Pin schreibt `reference_image_url` **und**
  `audio_plan.twoshot.anchor_face_audit` mit `ok:true` + `version`.
- Beim erneuten Eintritt greift der Reuse-Zweig
  (`prevAuditOk && existingLooksComposed`): der Anchor wird übernommen, die
  gesamte Compose-/Audit-Ladder wird übersprungen.
- Run-Provenance ist unabhängig davon persistiert: `active_run_id`,
  `plate_generation` und der Ledger-Job-Stempel liegen bereits vor der
  Anchor-Phase in der DB.

Ein Fortsetzen nach Anchor-Pin ist also **ohne Verlust von Run-,
Generation- oder Anchor-Provenance möglich**. Einschränkung, die vor einer
Umsetzung von Variante 2 geklärt werden müsste: ein zweiter Eintritt trifft
auf den bereits akquirierten `base_video`-Ledger-Job (`already_in_flight`) —
das berührt Ledger-Semantik, die hier ausdrücklich nicht geöffnet wird.

## 8. Laufzeit-Limits

Die produktive Runtime ist die Supabase-Edge-Runtime (Deno-Isolate).
Maßgeblich sind zwei getrennte Budgets: eine harte **CPU-Zeit pro Worker**
(im Sekundenbereich, plattformseitig gesetzt) und eine deutlich großzügigere
**Wall-Clock**. Der Run lief über 45 s Wall-Time problemlos durch drei
Provider-Roundtrips — es war also nachweislich **nicht** die Wall-Clock,
sondern exakt das CPU-Budget, und der Abbruchtext `CPU Time exceeded`
bestätigt das. Der exakte Zahlenwert ist aus dem Projekt heraus nicht
auslesbar und wird bewusst nicht behauptet; für den Fix ist nur relevant,
dass CPU eine eigene, kleine, nicht durch Warten entlastete Ressource ist.

## 9. Entscheidungsvorschlag (Fix-Contract)

**Variante 1 — teure Zwischenergebnisse innerhalb derselben Anchor-Sequenz
wiederverwenden. Empfohlen als alleinige Maßnahme.**

Vertrag:

1. Ein Bild wird pro Lauf **höchstens einmal** geladen und **höchstens einmal**
   nach Base64 encodiert; Schlüssel ist die Bild-URL. Der Anchor-Encode wird
   aus der `compareOnePortrait`-Schleife herausgehoben und geteilt.
2. Das Base64-Encoding wird auf ein blockweises Verfahren umgestellt
   (Chunk-basiert statt Byte-für-Byte-String-Konkatenation) — identisches
   Ergebnis, ohne quadratisches Speicher-/CPU-Verhalten.
3. Kein Gate, kein Retry, kein Schwellwert, keine Attempt-Anzahl, keine
   Reihenfolge und kein Ergebnisformat ändern sich. Die Ladder bleibt exakt
   wie heute; vier Attempts bleiben vier Attempts.
4. Damit sinkt die Anchor-CPU-Last von 7 auf 2 Voll-Anchor-Encodings und
   wächst nicht mehr mit N.

Warum das allein tragfähig ist: der CPU-Verbrauch der Stage besteht praktisch
vollständig aus diesen Encodings; alles andere ist Netzwerk-Wartezeit, die
das CPU-Budget nicht belastet.

**Variante 2 — Phasen-Trennung am bestehenden Persistenzpunkt.
Nur als Rückfallebene, falls Variante 1 messbar nicht reicht.**

Vertrag: nach erfolgreichem Anchor-Pin (Anchor-URL + `anchor_face_audit ok`
persistiert) übernimmt ein frischer Worker die v274-Identity-Auflösung und den
Plate-Dispatch; Wiedereintritt über den bereits vorhandenen Reuse-Zweig,
Provenance über `active_run_id` + `plate_generation`. Voraussetzung wäre eine
gesonderte Freigabe, weil der Wiedereintritt den bestehenden Ledger-Job
berührt.

**Variante 3 — Worker-/Runtime-spezifischer Umbau.** Nur wenn 1 und 2
nachweislich nicht reichen. Aktuell nicht indiziert.

## 10. Explizit nicht geöffnet

Ledger-/Reaper-Semantik, `dispatch_uncertain`, RS3, Refund/Accounting (P1-A
frozen), HappyHorse-Providerlogik, Lip-Sync/Preclip, Face-/BBox-/Masken-
geometrie und deren Qualitätsgates, Sprecherzahl und `speaker_idx`-Semantik.
Insbesondere wird kein Retry- oder Qualitätsgate reduziert.

---

**FA-4/P1-B ROOT CAUSE IDENTIFIED / FIX CONTRACT READY**
Empfehlung zur Freigabe: Variante 1.
