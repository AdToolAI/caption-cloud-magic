# V462 — Provider Input Suitability: Success-vs-NOOP Differential Audit (READ-ONLY)

V461 ist geschlossen und wird nicht mehr angefasst. Die Pipeline entscheidet
ehrlich; offen bleibt nur noch die Provider-Frage: Warum erzeugt Sync.so bei
technisch gültigen Inputs keine Lippenbewegung?

## Kontrollgruppe ist vorhanden

Der Dispatch-Log enthält eine echte Erfolgsgruppe: 51 Passes mit
`MOTION_VERDICT_MOVED` (01.–02.08.) und dazu 24 `MOTION_VERDICT_PASSTHROUGH`.
Dem stehen 81 `NOOP_LADDER_EXHAUSTED`-Passes gegenüber, darunter die vier
Passes des letzten kontrollierten Laufs, die das V461-Face-Gate sauber
passiert haben. Damit ist ein Differenzvergleich ohne neuen Lauf möglich.

## Was verglichen wird

Pro Pass wird ein Merkmalsvektor aus bereits gespeicherten Daten gebildet —
keine neuen Dispatches, keine Provider-Kosten:

```text
Gruppe SUCCESS : motion_verdict = moved
Gruppe NOOP    : NOOP_LADDER_EXHAUSTED mit bestandenem Face-Gate
```

Merkmale je Pass:

- Geometrie: face_share, Face-Größe in Provider-Pixeln, Crop-Größe,
  Output-Größe, Mund-ROI-Position und -Höhe, Mund-Offset-Vektor
- Kopf/Blick: Anchor-Quelle (Mund-Landmark vs. Bbox-Ableitung),
  Bbox-Seitenverhältnis als Profil-Indikator, Bewegung der Box über die
  Frames (Box-Sequenz-Streuung)
- Video: Dauer, Framecount, FPS, Bytes, Bytes pro Frame als grober Proxy für
  Bildbewegung im Ausgangsclip
- Audio: Dauer, Lead-in bis zum ersten Sprachanteil, Voiced-Anteil,
  Peak-dBFS, Sample-Rate, ob normalisiert
- Provider-Parameter: Modell, sync_mode, ASD-Transport, auto_detect,
  Sprecheranzahl, Koordinatenraum
- Ergebnis: delta_mean des Motion-Gates, mad_ratio-Telemetrie

## Auswertung

1. Verteilungsvergleich je Merkmal zwischen SUCCESS und NOOP; benannt werden
   nur Merkmale, die die Gruppen tatsächlich trennen.
2. Gegenprobe an genau den vier Passes des letzten Laufs: Für jeden wird
   gesagt, welches Merkmal ihn in die NOOP-Region legt — inklusive des
   frontalen Falls, der aktuell am wenigsten erklärt ist.
3. Prüfung, ob sich zwischen der Erfolgsperiode (Anfang August) und heute ein
   Provider-Parameter oder ein Preclip-Merkmal systematisch geändert hat
   (z. B. Preclip-Dauer, Lead-in, ASD-Transport, Modell).
4. Wenn die vorhandenen Daten den frontalen Fall nicht erklären, wird das
   ausdrücklich als offen benannt statt eine Hypothese als Befund zu
   verkaufen; dann folgt ein Vorschlag für die kleinstmögliche zusätzliche
   Messung.

## Ergebnis dieses Gates

Ein schriftlicher Befund mit:

- Trennmerkmal(en) zwischen erfolgreichen Provider-Syncs und echten NOOPs
- Einordnung der vier aktuellen Passes
- einer konkreten, eng begrenzten Empfehlung für V463 (Framing, Preclip-Struktur,
  Audio-Aufbereitung oder Provider-Parameter — genau eine Achse)

Kein Code, keine Schwellen, keine Deploys, kein Provider-Call. Danach STOP.

## Technische Details

- Quellen: `syncso_dispatch_log` (`meta.provider_input_fingerprint`,
  `meta.preclip_crop`, `face_share_in_preclip`, `motion_verdict`,
  `motion_probe_meta`), `composer_scenes.dialog_shots->'passes'`
  (`v461_face_gate`, `preclip_dims`, `semantic_input_fingerprint`).
- Auswertung erfolgt rein per SQL-Leseabfragen; Ergebnisse werden als
  `docs/v462-provider-suitability-audit.md` abgelegt.
- Eingefroren: Motion-Detektor, Motion-Schwellen, Face-Gate, Dedup, Refunds,
  Provider-Zertifizierung, Preclip-Geometrie.
