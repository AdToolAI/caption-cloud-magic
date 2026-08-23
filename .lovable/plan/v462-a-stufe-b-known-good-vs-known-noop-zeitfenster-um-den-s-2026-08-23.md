# V462-A Stufe B — Known-Good vs. Known-NOOP: Zeitfenster um den Sprachbeginn

Strikt READ-ONLY. Kein Lauf, kein Re-Render, keine Pipeline-Änderung, keine Provider-Dispatches.

## Korrektur zur letzten Aussage

"Framing ist die einzige offene Ursache" war zu stark formuliert. Belegt ist:
Der Input ist gültig, unsere Orchestrierung und Auswertung sind korrekt, und der
Provider erzeugt trotzdem keine Lippenbewegung. Framing (Gesichtsanteil 0,40–0,75
bei allen NOOPs gegen 0,06–0,18 bei allen SUCCESS-Passes) ist bisher der einzige
gemessene überlappungsfreie Unterschied — aber die Stichprobe ist 4 gegen 4, und
Timing/Pose im Moment des Sprachbeginns wurde noch nicht gemessen. Beide Hypothesen
stehen gleichberechtigt nebeneinander, bis Stufe B misst.

## Ziel

Für jeden Pass beider Gruppen das Zeitfenster um den Sprachbeginn vermessen und prüfen,
ob SUCCESS und NOOP sich dort systematisch trennen — insbesondere die Hypothese
"stabiler Initialzustand vor Sprachbeginn" gegen "Kopf bereits in Bewegung".

## Was gemessen wird (pro Pass, aus den Originalartefakten)

| Merkmal | Methode |
|---|---|
| Sprachbeginn t0 | RMS-Onset im dispatchten Audio, 20-ms-Fenster |
| Vorlauf vor Sprache | t0 relativ zum Preclip-Start, in ms |
| Kopf-/Bildbewegung in 0…t0 | mittlere Frame-Differenz im Fenster vor Sprachbeginn |
| Bewegung in den ersten 500 ms | Frame-Differenz-Profil, 100-ms-Bins |
| Mundbewegung vor Sprache | Frame-Differenz nur im Mund-ROI (aus Pass-Geometrie, nicht geschätzt) |
| Yaw beim Sprachbeginn | Vision-Klassifikation auf dem Frame bei t0 |
| Mouth-Y im Crop bei t0 | Mund-ROI-Center aus der Pass-Geometrie plus Verifikation am Frame |
| Face-Position-Drift | Verschiebung des Mund-ROI-Schwerpunkts über den Clip, in px |
| Voiced-Ratio, Peak, Dauer | bereits erhoben, wird in die Gesamttabelle übernommen |

## Stichprobe erweitern

Die aktuelle Basis ist 4 SUCCESS gegen 4 NOOP — zu klein für eine Schwelle.
Zusätzlich werden die historischen Passes mit `motion_verdict = moved` herangezogen
(51 Einträge im Dispatch-Log). Für alle, deren Preclip noch im Bucket liegt, wird
dasselbe Merkmalsprofil erhoben, damit SUCCESS-Verteilung und NOOP-Verteilung
gegeneinander stehen statt Einzelfall gegen Einzelfall.

## Erwartetes Ergebnis

Ein Ergebnis von genau einer der folgenden Formen:

1. Timing trennt sauber (z. B. SUCCESS hat durchgehend Vorlauf über X ms mit ruhigem
   Kopf, NOOP nicht) — dann ist das der stärkste Kandidat.
2. Framing trennt sauber, Timing nicht — dann bleibt der Framing-Kontrakt der Kandidat.
3. Beide trennen teilweise — Angabe, welches Merkmal die Gruppen besser separiert.
4. Keins trennt — dann ist der Provider bei diesem Inputtyp unzuverlässig, und der
   nächste Schritt ist ein Provider-Wechsel (HappyHorse/Hailuo) statt eines Input-Fixes.

## Ausgabe

Erweiterung von `docs/v462-provider-suitability-audit.md` um Abschnitt B mit
Merkmalstabelle, Verteilungsvergleich und einer benannten Schlussfolgerung.
Danach STOP — kein schreibendes Gate ohne separate Freigabe.

## Technisch

- Artefaktzugriff über die bereits deployte Admin-Funktion `v462-artifact-sign`
  (signiert Pfade im privaten Bucket `lipsync-plates`), Analyse lokal mit ffprobe/ffmpeg.
- Mund-ROI stammt aus `dialog_shots.v461_face_gate.metrics.mouth_roi` des jeweiligen
  Passes, nicht aus einer Schätzung am Bild.
- Vision-Klassifikation nur für Yaw am t0-Frame, mit demselben Prompt für beide Gruppen.
