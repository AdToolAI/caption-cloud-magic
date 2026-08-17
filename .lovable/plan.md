# FA-4 Root-Cause-Lock: Face-Candidate-Auswahl (read-only)

Statuskontext: FA-4 bleibt auf **TECHNICAL PASS / VISUAL REVIEW: ISSUES**. Das
visuelle Review ist bereits erfolgt und hat einen P0 gezeigt. Der Lock läuft
unter diesem Status weiter; ein Zurücksetzen auf "VISUAL REVIEW PENDING" oder
ein Setzen auf PASS ist in diesem Schritt ausgeschlossen.

Ziel: beweisen, warum für Sarah, Matthew und Kay winzige False-Positive-Boxen
statt der korrekten großen Gesichter benutzt wurden — und erst danach einen
Fix-Contract festlegen. Kein Code, kein Render, kein Retry, keine DB-Writes.

## Was heute schon belegt ist (aus Code + persistierter Szene S11)

Der Anchor ist sauber. `anchor_face_layout` (v278) enthält vier eindeutige
Slots mit korrekten Character-IDs und plausiblen normalisierten Zentren
(Sarah 0.243, Samuel 0.386, Matthew 0.601, Kay 0.828 — exakt L→R).
`assignmentLock` ist vollständig und korrekt, Quelle
`v277_anchor_rekognition_complete`.

Die Plate-Detektion enthält zehn Gesichter. Die vier real plausiblen
Gesichter liegen bei `[226,244,286,327]`, `[476,209,540,294]`,
`[753,187,819,277]`, `[1030,208,1099,296]` — deren normalisierte Zentren
(0.199 / 0.396 / 0.611 / 0.829) decken sich fast perfekt mit dem Anchor.
Die Geometrie war also eindeutig lösbar.

Trotzdem wurden diese Boxen benutzt:

| Speaker | verwendete Box | Befund |
|---|---|---|
| Sarah | `[1125,7,1142,30]` | 17×23 px, oben rechts, `confidence: 0`, `matchConfidence: 0.85` |
| Samuel | `[476,209,540,294]` | korrektes Gesicht, `confidence: 0.69` |
| Matthew | `[819,113,831,128]` | 12×15 px, `confidence: 0.89` (Detektor-gelabelt) |
| Kay | `[923,98,940,119]` | 17×21 px, `confidence: 0.77` (Detektor-gelabelt) |

Die daraus abgeleiteten Preclip-Crops passen dazu: Sarah `x=1024…1244, y=0…220`
(ihr Slot liegt links, nicht dort), Kay `x=734…1128, y=0…394` (überdeckt
Matthews Slot mit).

Drei Mechanismen im Code, die dazu passen — alle im aktuellen
`compose-dialog-segments`:

1. **First-Match statt Ranking im v277-Lock.** Die Map `characterId → PlateFace`
   wird über `!anchorRekFacesByCid.has(faceCid)` befüllt, also in
   Detektor-Reihenfolge. Für Sarah steht die winzige Box vor dem korrekten
   Kandidaten `[226,244,286,327]` — der große Kandidat wird nie erreicht.
   Das direkt danach existierende Confidence-Ranking (`byIdRanked`) greift
   nur, wenn der Lock nichts liefert.
2. **Der L→R-Bridge-Fallback labelt False Positives.** Zwei der benutzten
   Boxen tragen `confidence: 0` und exakt `matchConfidence: 0.85` — das ist
   die Signatur des Anchor-Slot-Bridges, der Anchor-Slot i auf Plate-Face i
   in Slot-Reihenfolge schreibt. Die persistierten Plate-Slots sind aber
   nicht nach x sortiert (Slot 0 liegt bei x=1125). Die Annahme "beide
   Detektoren sortieren L→R" trifft hier nicht zu.
3. **Der v239-Trust-Gate hebelt den Sanity-Check aus.** Slots gelten als
   vertrauenswürdig ab `confidence >= 0.70` oder `matchConfidence >= 0.55`.
   Alle drei falschen Boxen erfüllen das (0.85 / 0.89 / 0.77) und werden
   deshalb nie gegen die objektiven Kriterien (Fläche 0.3 %–25 %,
   Seitenverhältnis) geprüft — obwohl sie mit ~0.04 % Plate-Fläche klar
   darunter liegen. Die Reparatur (`v185-anchor-repair`) läuft nie an.

Danach fällt der letzte Schutz aus: der Face-Probe vor Sync.so meldet
`probe_unavailable` und wird ausdrücklich als `non_blocking: true` behandelt;
alle sechs Pässe liefen so durch.

**Wichtige Einschränkung der bisherigen Hypothese:** "locked Character →
gerankter Kandidat statt First Match" repariert Sarah, aber **nicht** Matthew.
Für Matthews Character-ID existiert im Detektionssatz nur ein einziger
gelabelter Kandidat, und der ist die winzige Box; sein echtes Gesicht
`[753,187,819,277]` ist unlabeled (`characterId: null`). Ein reines
Re-Ranking pro Character-ID hätte hier nichts zu wählen. Dasselbe gilt
tendenziell für Kay.

## Nächster Schritt: read-only Root-Cause-Lock

Der Lock beantwortet genau vier Fragen — nichts darüber hinaus:

1. **Lief bei S11 der v278/Hungarian-Pfad?** Und falls ja: an welcher Stelle
   wurde sein korrektes geometrisches Ergebnis später überschrieben? Beleg aus
   den Edge-Logs des Runs. **Log-Zeitfenster mindestens 2026-08-17
   20:39:00Z–20:49:30Z** — `base_video` war erst gegen 20:44:30Z fertig, die
   Face-/Preclip-Entscheidung liegt danach. Zeilen `v278_router`,
   `v183_plate_identity_mapping`, `v277_anchor_lock_face_missing`.
   Offene Inferenz, die die Logs bestätigen oder widerlegen müssen: persistiert
   sind 10 Plate-Faces; bei einem angenommenen 4/4-v278-Ergebnis müsste
   `plateIdentityMap.faces` im Wesentlichen die vier gerouteten Faces enthalten.
   Das deutet darauf hin, dass v278 nicht ok war oder verworfen wurde und der
   Legacy-Pfad `resolvePlateFaceIdentities` übernommen hat.
2. **Lief `v183_anchor_identity_slot_bridge`?** Wenn ja: welche Face-Slots
   wurden dadurch gelabelt (Signatur `confidence: 0` / `matchConfidence: 0.85`)?
3. **Warum akzeptierte `v239_repair_gate` Sarah/Matthew/Kay als trusted,**
   obwohl ihre Boxflächen objektiv unter der Sanity-Schwelle liegen?
   Gegenrechnung mit den **bestehenden Produktionskriterien**, keine neuen
   Schwellen: Plate-Flächenanteil gegen 0.003–0.25, Aspect gegen 0.4–2.5. Pro
   verwendeter Box dokumentieren: Area %, Aspect, `confidence`,
   `matchConfidence`, abgeleiteter Trust-Grund und ob `bboxSanity()` überhaupt
   ausgeführt wurde.
4. **Lief anschließend v277 First-Match auf diesen bereits falsch gelabelten
   Kandidaten** und machte sie damit zur autoritativen `speakerPlateBBox`?

Rekonstruierte Beweiskette (in genau dieser Reihenfolge, um zu zeigen, wo eine
zunächst richtige Information verloren geht):

```text
v278_router
  → ggf. Legacy resolvePlateFaceIdentities
  → v183_anchor_identity_slot_bridge
  → Aufbau anchorRekFacesByCid
  → v277 locked-face selection
  → speakerPlateBboxes[]
  → v239_repair_gate
  → Preclip-Crop
  → Face-Probe / probe_unavailable
```

Zusätzlich als Beweis-Gegenprobe (keine fünfte Frage, sondern Beleg zu 1):
**zuerst objektiv unplausible Kandidaten entfernen** (Area/Aspect nach
Produktionskriterien), dann die vollständige **4×N-Kostenmatrix** über
normalisierte Face-Zentren gegen die vier Anchor-Slots bilden und **global
bijektiv (Hungarian) minimieren** — nicht greedy nearest neighbor, der bei dicht
stehenden Gesichtern zufällig richtig liegen kann. Kostenmatrix und gewählte
Zuordnung vollständig dokumentieren. Erwartung: die vier großen realen
Kandidaten sind aus den bereits vorhandenen Run-Daten eindeutig
rekonstruierbar.

Ergebnis dokumentieren in `docs/v433-motion-studio-final-acceptance.md` als
eigener Abschnitt "FA-4 Root-Cause-Lock — Face-Candidate-Auswahl", unter dem
bestehenden Status TECHNICAL PASS / VISUAL REVIEW: ISSUES. Erst wenn alle vier
Übergänge mit Run-Daten/Logs belegt sind, wird der Fix-Contract eingefroren.

## Fix-Contract-Skizze (nur Entwurf, noch nicht umsetzen)

Zur Freigabe nach dem Lock, in dieser Reihenfolge:

- **Geometrie ist Wahrheit, Label ist Hinweis.** Für jeden gelockten
  Character wird der Kandidat gewählt, der dem Anchor-Slot geometrisch am
  nächsten liegt (bijektiv, normalisierte Zentren), nicht der erste oder der
  labelstärkste. Unlabeled Kandidaten sind dabei gleichberechtigt — sonst
  bleibt Matthew unlösbar.
- **Plausibilitätsfilter vor der Auswahl.** Kandidaten unterhalb einer
  Mindestfläche oder mit unplausiblem Seitenverhältnis fliegen aus dem
  Kandidatensatz, bevor gematcht wird — unabhängig von ihrer Confidence.
- **Trust-Gate darf Sanity nicht überspringen.** Confidence darf nur
  entscheiden, ob repariert wird — nicht, ob geprüft wird.
- **Deterministisches Crop-Containment-Gate statt Probe-Zwang.** Vor
  Provider-Dispatch muss deterministisch beweisbar sein, dass der Preclip-Crop
  den für den gelockten Character ausgewählten Face-Kandidaten enthält und
  keinen konkurrierenden Sprecher als Ziel übernehmen kann. Ein optionaler
  Vision-Probe darf zusätzliche Evidenz liefern, aber `probe_unavailable` darf
  nicht der einzige Schutz sein — sonst wird aus dem Identity-Bug ein
  Availability-Bug.
- **Regressionsschutz.** Fixture aus genau diesem Detektionssatz (zehn
  Boxen, drei False-Positive-Labels) als Testfall.

Zielvertrag (schon jetzt festgehalten):
`Anchor Character Lock → plausible Plate-Face candidates → global bijective
geometry assignment → identity labels only as supporting score → sanity always
enforced → deterministic crop containment gate → Sync.so`.
Nicht mehr: `Character label → first matching PlateFace → trust by confidence →
dispatch`.

Ledger, Fan-out, Turn-ID, `speaker_idx`, RS3, Mux und Finalizer bleiben
unberührt.
