# FA-4 Root-Cause-Lock: Face-Candidate-Auswahl (read-only)

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

1. **Herkunft der Plate-Faces belegen.** Aus den Edge-Logs des Runs
   (Zeitfenster um 2026-08-17 20:38 UTC) die Zeilen `v278_router`,
   `v183_plate_identity_mapping`, `v183_anchor_identity_slot_bridge`,
   `v239_repair_gate` und `v277_anchor_lock_face_missing` ziehen. Damit ist
   eindeutig, ob der geometrische v278-Hungarian-Router lief und warum sein
   Ergebnis nicht die Wahrheit wurde (er hätte die vier Zentren korrekt
   zugeordnet), oder ob der Legacy-Pfad übernommen hat.
2. **Trust-Gate-Entscheidung pro Slot nachrechnen.** Für jede der vier
   benutzten Boxen Flächenanteil, Seitenverhältnis und Trust-Grund
   dokumentieren, um zu zeigen, dass der Sanity-Check nur wegen der
   Confidence-Trust-Abkürzung ausgelassen wurde.
3. **Gegenprobe zur Geometrie.** Anchor-Zentren gegen alle zehn
   Plate-Kandidaten stellen und belegen, dass eine reine bijektive
   Nächste-Nachbar-Zuordnung (Hungarian auf normalisierten Zentren) genau die
   vier korrekten Gesichter liefert — als Beleg, dass die Information im Run
   vorhanden war.
4. **Ergebnis dokumentieren** in `docs/v433-motion-studio-final-acceptance.md`
   als eigener Abschnitt "FA-4 Root-Cause-Lock — Face-Candidate-Auswahl",
   inklusive der Erkenntnis aus Punkt 1 und einer klaren Aussage, ob der Fix
   Ranking-only sein kann oder Geometrie-first sein muss.

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
- **Preclip-Identity-Validation fail-closed.** Ein Pass, dessen Crop nicht
  nachweislich das Ziel-Gesicht enthält, darf nicht an Sync.so gehen.
- **Regressionsschutz.** Fixture aus genau diesem Detektionssatz (zehn
  Boxen, drei False-Positive-Labels) als Testfall.

Ledger, Fan-out, Turn-ID, `speaker_idx`, RS3, Mux und Finalizer bleiben
unberührt.
