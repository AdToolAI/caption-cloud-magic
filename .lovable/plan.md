# Gate v433: Motion Studio Differential RCA + Continuity Contract Audit (read-only)

Zwei Ebenen in einem Gate. Ebene 1: den Samuel-T2-No-op forensisch belegen statt vermuten (Primärursache T8 Preclip / T9 Face-Gate / T10 Provider / T12 Outcome-Gate). Ebene 2: read-only prüfen, ob die heutige Motion-Studio-Architektur die zentralen Produktions-Verträge tatsächlich besitzt — allen voran die Lineage `Szene N → Continuity-Frame → Szene N+1 Anchor`.

v400 ist dabei Vergleichsmaßstab, nicht Rückbauziel. Der aktuelle Code bleibt Source of Truth; aus v400 wird nur übernommen, was einen Fehler erklärt oder die heutige Architektur nachweislich verbessert. Kein Code wird angefasst, keine Schwelle verstellt, kein Render angestoßen.

## Ausgangslage (verifiziert)

- Die Kette steht unter Freeze (`.lovable/LIPSYNC-FEATURE-FREEZE.md`, v400). Der Gate respektiert ihn vollständig.
- Das heutige Outcome-Gate misst bereits gepaart Input-vs-Output und nur eine Mundregion: `_shared/measure-provider-motion-sync.ts` rendert N=6 Stills und misst die ROI `centerX 0.5 / centerY 0.6 / 0.28 x 0.12`; `_shared/motion-probe-classifier.ts` entscheidet über `deltaMean = provider.mean − preclip.mean` mit MOTION_THRESHOLD 15.4057 und NOOP_THRESHOLD 3.6827. Die Annahme „unser Gate misst globale Bewegung im ganzen Bild" trifft auf den heutigen Stand also nicht mehr zu — sie beschreibt den Zustand, unter dem T2 damals durchgerutscht ist.
- Damit verschiebt sich die offene Frage: Nicht „misst das Gate die falsche Region?", sondern „reicht ein ΔMean-Schwellenwert, der aus genau diesem S11-Lauf kalibriert wurde, um denselben Lauf zu bewerten?" Das ist eine Zirkularitätsfrage und wird in Block 4 geprüft.
- Kandidaten-Szenen mit Mehr-Sprecher-Läufen sind in `composer_scenes.dialog_shots` vorhanden (zuletzt zwei 6-Pass-Läufe vom 17.08., einer `done`, einer `failed`), dazu der 4-Pass-Referenzlauf vom 03.08. Ob darunter der konkrete Samuel-T2-Fall liegt, wird in Block 1 identifiziert, nicht vorausgesetzt.

## Block 1 — Fallauswahl und Artefakt-Inventar

Aus `composer_scenes.dialog_shots` je einen Golden-Failure-Turn (Mund statisch, Job `done`) und einen Golden-Success-Turn ziehen. Für beide vollständig auflisten, was tatsächlich existiert und noch abrufbar ist:

```text
reference_image_url · lock_reference_url · plate_url
preclip_url · preclip_crop (Geometrie, faceShareInCrop, anchor, clamped)
audio_url · job_id · provider · raw provider output_url
motion metrics (preclip/provider mean+peak, deltaMean, verdict)
active_run_id · plate_generation · Slot-Zuordnung
```

Fehlende oder abgelaufene Artefakte werden als Lücke protokolliert — eine Lücke ist selbst ein Befund (forensische Nachvollziehbarkeit).

## Block 2 — Fünf Verträge gegen den heutigen Code prüfen

Statische Prüfung, ob die Pipeline diese Verträge tatsächlich einhält, mit Datei- und Zeilenbeleg je Vertrag:

1. **Geometry Authority** — Face-BBox ausschließlich auf `reference_image_url`; kein Geometriepfad liest `lock_reference_url` oder ein Plate-Derivat.
2. **Assignment-Lock als ID-Kette** — `dialog_turn → speaker UUID → assignment_lock → face slot → preclip → provider job → webhook → reprojection` trägt dieselbe unveränderliche Slot-ID. Jede Stelle mit Namensabgleich, Re-Detection oder „best match" wird benannt.
3. **Ein Gesicht pro Provider-Input** — der abgeschickte Preclip enthält physisch genau ein Gesicht; keine Koordinaten-Hints auf einem Multi-Face-Frame.
4. **Face-Gate vor dem Provider** — Mindestgesichtsgröße und Face-Share werden vor dem Dispatch geprüft, fail-closed.
5. **Run-/Generation-Guard** — alte Webhooks können einen neuen Lauf nicht überschreiben.

## Block 3 — Artefakt-Forensik am Golden-Failure-Turn

Der zentrale Beweisschritt: nicht was wir schicken wollten, sondern was ankam.

- Preclip-MP4 herunterladen, Frames extrahieren, prüfen: Wie viele Gesichter sind sichtbar? Welchen Bildanteil hat das Zielgesicht? Liegt der Mund randnah? Passt die Geometrie zum protokollierten `preclip_crop`?
- Gegenprobe: dieselbe Messung am Golden-Success-Preclip. Der Unterschied ist die Aussage.
- Rohen Provider-Output gegen den Preclip stellen: Ist der Mund dort bereits statisch, oder erst nach Reprojektion/Mux?

Damit trennt sich Provider-No-op (T10) sauber von Reprojection/Stitching (T13+).

## Block 4 — Gate-Nachrechnung, offline

Die gespeicherten Metriken des Failure-Turns durch den heutigen `classifyMotionProbe()` schicken und protokollieren, welches Verdict der aktuelle Code liefert. Zusätzlich die ROI auf dem tatsächlichen Preclip verorten: Liegt `centerY 0.6` bei diesem Crop wirklich auf dem Mund, oder daneben? Eine ROI, die den Mund verfehlt, erklärt einen False-Pass unabhängig von jeder Schwelle.

Ergebnis ist eine Aussage der Form: „Der heutige Gate hätte diesen Fall (nicht) gefangen, weil …" — plus die Angabe, ob die Schwellen aus demselben Lauf stammen, den sie bewerten.

## Block 5 — Kreuztest-Matrix, nur als Spezifikation

Die A/B/C/D-Matrix (Failure-Preclip × Failure-Audio, Failure-Preclip × Success-Audio, Success-Preclip × Failure-Audio, Direktaufruf am Provider unter Umgehung der Pipeline) wird in diesem Gate **beschrieben und vorbereitet**, nicht ausgeführt: sie ruft einen externen Provider auf, kostet Credits und ist damit keine Read-only-Operation. Sie ist der erste Schritt des Folge-Gates, sobald Block 1–4 die Hypothese eingegrenzt haben.

## Block 6 — Motion-Studio-Verträge über Lip-Sync hinaus

Systemweite Prüfung, jeder Vertrag mit Codebeleg und Verdikt `erfüllt / teilweise / verletzt / nicht prüfbar`:

1. **Run- & Artefakt-Lineage** — Szene, Plate, Audio, Preclip, Provider-Ergebnis und Final-Render tragen dieselbe Run-Kennung; kein Artefakt ohne Zuordnung.
2. **Cast & World als Identitätsquelle** — Charakteridentität stammt aus der registrierten Referenz, nicht aus einer Neuinterpretation pro Szene.
3. **Scene Continuity / Frame Chaining** — die tatsächliche Kette wird an echten Projektdaten nachverfolgt:
   ```text
   Szene N Final-Output → gewählter Continuity-Frame → Frame-Metadaten/Hash
   → Szene N+1 Referenz-/Anchor-Auswahl → Generierungs-Request → Ergebnis
   ```
   Gesucht wird, ob an irgendeiner Stelle noch ein älterer Anchor, eine Character-Reference oder ein Fallback dazwischenfunkt.
4. **Anchor-Lineage & Trennung der Anchor-Typen** — ist jederzeit erkennbar, ob eine Szene von einer Character-Reference, einem Vorgänger-Frame oder einem bewusst gesetzten Alternativ-Anchor abstammt? Und werden **Character-Identity-Anchor** und **Scene-Continuity-Anchor** getrennt geführt (Frame für Pose/Kamera/Kleidung/Licht, Cast-Referenz für harte Identität)?
5. **Generational Drift** — wird der Continuity-Frame gegen die Cast-Referenz rückgekoppelt, oder entsteht nach N Szenen eine Kopie-von-einer-Kopie? Belegt an einem realen Mehr-Szenen-Projekt: Identitäts-Distanz von Szene 1 zu Szene N.
6. **Assignment Consistency** — Sprecher, Character-UUID, Face-Slot und Voice bleiben über die gesamte Kette identisch (Erweiterung von Vertrag 2 aus Block 2 auf Voice und Cross-Scene).
7. **Outcome Gates** — an welchen Stellen gilt „Provider-Job done" implizit als „Ergebnis korrekt"? Jede solche Stelle wird gelistet.
8. **Fail-closed** — bei unbelastbarer Identität, Geometrie, Lip-Sync oder Continuity: bricht die Pipeline ab oder liefert sie einen scheinbar fertigen Clip?
9. **Final Composition Integrity** — können Stitching, Audio, Übergänge oder Reprojektion einen zuvor korrekten Zwischenstand wieder zerstören?

## Ergebnis dieses Gates

Ein Bericht `docs/v433-motion-studio-rca.md` mit:

- Artefakt-Inventar beider Turns inklusive Lücken,
- Lip-Sync-Vertragsmatrix (5 Verträge, Block 2) und Motion-Studio-Vertragsmatrix (9 Verträge, Block 6), jeweils mit Codebeleg,
- Messwerten aus der Preclip-Forensik und der Gate-Nachrechnung,
- der real nachverfolgten Continuity-Lineage eines Mehr-Szenen-Projekts,
- einer Befundzeile in dieser Form:
  ```text
  Lip-Sync-Primärursache = <T8|T9|T10|T12> + Begründung
  T12 heutiger Gate      = hätte gefangen / hätte nicht gefangen
  Scene-Continuity       = erfüllt / teilweise / verletzt
  Assignment/Anchor/Run  = je Vertrag belegt
  Nächster minimaler Reparaturschritt = X
  ```
- der Kreuztest-Spezifikation (Block 5) als Folgeschritt.

Kein Fix, keine Schwellenänderung, kein Deploy in diesem Gate. Der Freeze bleibt unangetastet.

## Technischer Hinweis

Die Artefakt-Forensik läuft über Lesezugriffe auf `composer_scenes` / `composer_scene_jobs` / Continuity-Queue, signierte Storage-URLs und lokale Frame-Analyse. Für Frame-Extraktion wird die lokale Sandbox genutzt, nicht die produktive Lambda-Still-Route — damit erzeugt der Gate keine Produktionslast und verändert keine Zählerstände. Identitäts-Distanz für den Drift-Test wird lokal auf heruntergeladenen Frames gemessen, ohne externen Modellaufruf.
