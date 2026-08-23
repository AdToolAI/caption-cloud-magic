# V462 — Provider Input Suitability: Success-vs-NOOP Differential Audit (READ-ONLY)

V461 ist geschlossen und wird nicht mehr angefasst. Die Pipeline entscheidet
ehrlich; offen bleibt nur noch die Provider-Frage: Warum erzeugt Sync.so bei
technisch gültigen Inputs keine Lippenbewegung?

Neu und vorgezogen: **V462-A — Known-Good Homepage Control**. Der 4-Sprecher-Clip
auf der Startseite (`public/videos/proof-clip.mp4`, eingebunden in
`src/components/landing/ProofMoment.tsx`) liegt heute nur als kopierte Datei vor —
ohne Verweis auf den erzeugenden Run. Bevor irgendetwas verglichen wird, muss
dieser Run erst identifiziert und die Identität belegt werden.

## Stufe A1 — Herkunft des Homepage-Clips belegen

1. Technische Signatur der Datei bestimmen (Dauer, Auflösung, FPS, Codec,
   Audiospur, Bytes).
2. Kandidaten in `composer_scenes` suchen: abgeschlossene Lip-Sync-Szenen mit
   ~8 s, 4 Sprechern, deutscher Sprache. Der dokumentierte v400-Golden-Run
   `c934a823-47de-49b7-a62e-a116b49ca3b2` (8,0 s, 4 Sprecher, `complete`) ist der
   erste Kandidat, gilt aber ausdrücklich als **unbestätigte Vermutung**.
3. Identität nur akzeptieren, wenn Ausgabe-URL bzw. Datei-Signatur und
   Frame-Stichproben übereinstimmen. Lässt sich der Run nicht eindeutig
   zuordnen, wird das so berichtet — dann fällt V462-A weg und es bleibt beim
   statistischen Vergleich (Stufe B).

## Stufe A2 — Pass-gegen-Pass-Vergleich (nur bei bestätigter Herkunft)

Ein erfolgreicher Homepage-Pass gegen einen NOOP-Pass des letzten S01-Laufs, mit
identischer Merkmalsliste. Bevorzugt wird der Homepage-Sprecher gewählt, dessen
Bildsituation dem S01-Fall am ähnlichsten ist (3/4-Profil, kleines Gesicht,
mehrere Personen in der Plate).

Verglichen wird:

- **Tatsächlich gesendetes Preclip-MP4** (nicht Plate, nicht DB-Metadaten):
  Dauer, Größe, Framecount, FPS, Bytes.
- **Mundzustand im Eingangsvideo**: Wie stark bewegt sich der Mund schon vor
  Sync.so? Hypothese: Plates mit bereits natürlicher Mundbewegung sind schwerer
  zu überschreiben als ruhige Preclips.
- **Bewegung und Timing vor Sprachbeginn**: Lead-in bis zur ersten Stimme,
  Bildbewegung in diesem Vorlauf.
- **Crop-Verhalten**: statisch vs. dynamisch, Box-Streuung über die Frames,
  Kopfbewegung. Funktioniert die Homepage-Szene ohne dynamisches Tracking, ist
  Tracking nicht der Hauptschlüssel.
- **Audio**: Dauer, Stille vorn/hinten, Voiced-Anteil, Lautheit, Sample-Rate,
  Kanäle, Codec/Container, Normalisierung.
- **Provider-Parameter**: Modell/Modellversion, `sync_mode`, ASD-Verfahren und
  Transport, `auto_detect`, Koordinatenraum, Sprecheranzahl.
- **Geometrie**: face_share, Face-Größe in Provider-Pixeln, Mund-ROI und Offset.
- **Preclip-Technik damals vs. heute**: wurde überhaupt dasselbe Verfahren
  benutzt?

## Stufe B — Statistischer Rückhalt

Zusätzlich, aber nachrangig: 51 Passes mit `MOTION_VERDICT_MOVED` (01.–02.08.)
gegen 81 `NOOP_LADDER_EXHAUSTED`-Passes. Benannt werden nur Merkmale, die die
Gruppen tatsächlich trennen. Diese Gruppe dient der Absicherung des A2-Befunds,
nicht als Hauptbeweis.

## Ergebnis dieses Gates

- Beleg oder klare Absage zur Herkunft des Homepage-Clips.
- Merkmalstabelle Homepage-SUCCESS vs. S01-NOOP mit markierten Abweichungen.
- Benennung der Achse, die den Unterschied erklärt — oder die ausdrückliche
  Feststellung, dass die vorhandenen Daten ihn nicht erklären, plus Vorschlag
  für die kleinstmögliche zusätzliche Messung.
- Genau eine eng begrenzte Empfehlung für V463 (eine Achse: Preclip-Struktur,
  Audio-Timing, Ausgangs-Mundbewegung oder Provider-Parameter).

Kein Code, keine Schwellen, keine Deploys, kein Provider-Call, kein Rerender.
Danach STOP.

## Technische Details

- Quellen: `syncso_dispatch_log` (`meta.provider_input_fingerprint`,
  `meta.preclip_crop`, `face_share_in_preclip`, `motion_verdict`,
  `motion_probe_meta`), `composer_scenes.dialog_shots->'passes'`
  (`v461_face_gate`, `preclip_dims`, `semantic_input_fingerprint`),
  `docs/lipsync-golden-run-v400.md`.
- Medienanalyse per ffprobe/ffmpeg auf den bereits vorhandenen Dateien
  (Homepage-Clip lokal, Preclips/VO über gespeicherte Storage-URLs). Reine
  Lesezugriffe, keine Neuerzeugung.
- Ergebnis wird als `docs/v462-provider-suitability-audit.md` abgelegt.
- Eingefroren: Motion-Detektor, Motion-Schwellen, Face-Gate, Dedup, Refunds,
  Provider-Zertifizierung, Preclip-Geometrie.
