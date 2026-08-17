# FA-4 Root-Cause-Lock — Face-Candidate-Auswahl: ABGESCHLOSSEN

Status: **TECHNICAL PASS / VISUAL REVIEW: ISSUES** — unverändert. Kein Fix, kein Deploy, kein weiterer Render.

Variante A (statisch-deduktiver Pfadbeweis) ist abgeschlossen und in `docs/v433-motion-studio-final-acceptance.md` unter dem bestehenden Status dokumentiert.

## Finale Beweiskette

1. **Anchor korrekt** — `anchor_face_layout` für S11 enthält vier eindeutige Slots (Sarah, Samuel, Matthew, Kay) mit plausiblen L→R-Zentren.
2. **v278/Hungarian lief deduktiv erfolgreich**, wendete aber vor Hungarian keinen Area-/Aspect-Plausibilitätsfilter an. Die 10 persistierten Faces widersprechen dem nicht, weil `routePlateFacesToAnchor()` Extra-Faces im Ergebnis behält.
3. **Matthew + Kay wurden bereits im v278-Ergebnis auf winzige False Positives gemappt.**
4. **v183 Bridge** interpretierte fälschlich Slot als visuelle L→R-Reihenfolge und labelte zusätzlich einen False Positive als Sarah (`matchConfidence: 0.85`).
5. **v277 First-Match** (`anchorRekFacesByCid`) wählte pro Character den ersten gelabelten Kandidaten — exakt die vier später verwendeten `speakerPlateBboxes`.
6. **v239 Trust-Gate** akzeptierte die Boxen über Confidence/`matchConfidence` und übersprang dadurch `bboxSanity()` — obwohl Sarah, Matthew und Kay unter der Mindestfläche lagen.
7. **Falsche Preclip-Crops** → 6× `FACE_GATE_PROBE_UNAVAILABLE`, jeweils fail-open → Sync.so verarbeitete die falsche Geometrie.

## Vier Lock-Fragen — geschlossen

| Frage | Antwort |
|---|---|
| Q1: Lief v278/Hungarian? | JA — deduktiv bewiesen. Matthew und Kay bereits im v278-Ergebnis falsch. |
| Q2: Lief v183 Bridge? | JA — deduktiv bewiesen. Bridge-Signaturen (`confidence: 0`, `matchConfidence: 0.85`) reproduzierbar. |
| Q3: Warum akzeptierte v239 trotz Untergröße? | JA — bewiesen. Trusted-Shortcut überspringt `bboxSanity()`. |
| Q4: Machte v277 First-Match die falschen Kandidaten autoritativ? | JA — für alle vier geschlossen. Reihenfolge erzeugt exakt die verwendeten Boxen. |

## Gegenprobe

Nach Anwendung der bestehenden Sanity-Kriterien (Area 0.003–0.25, Aspect 0.4–2.5) bleiben exakt die vier großen plausiblen Faces übrig. Hungarian liefert dann global bijektiv: Sarah → links, Samuel → Mitte-links, Matthew → Mitte-rechts, Kay → rechts. Der Run hatte alle notwendige Geometrie — der Defekt liegt in der Candidate-Selection, nicht in fehlender Information.

## Fix-Richtung (eingefroren, noch nicht umgesetzt)

- Ranking-only: NEIN.
- Geometrie-first + Plausibilitätsfilter: JA.

Zielvertrag:

```text
Anchor Character Lock → plausible Plate-Face candidates → global bijective
geometry assignment → identity labels only as supporting score → sanity always
enforced → deterministic crop containment gate → Sync.so
```

Ledger, Fan-out, Turn-ID, `speaker_idx`, RS3, Mux und Finalizer bleiben unangetastet.

## Nächster Schritt

Keiner. STOP. Der Lock ist dokumentiert. Eine spätere Umsetzung des Fix-Contracts bedarf einer eigenen Freigabe.
