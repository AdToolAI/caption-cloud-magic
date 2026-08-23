# V468 — Pass-Contract Differential innerhalb desselben Runs (READ-ONLY)

Run: Szene `be60d106-…` (S01), 23.08.2026 21:58–22:02 UTC. Kein Dispatch, kein Rerender,
keine Pipeline-Änderung in diesem Gate.

## Ergebnis in einem Satz

**Es gibt keine deterministische Request-/Payload-Differenz zwischen NOOP- und MOVED-Pässen.**
Alle providerwirksamen Felder sind identisch; der einzige messbare Unterschied liegt im
**Bildinhalt des Preclips** (Kopfpose / Mundsichtbarkeit und Verhältnis Mundbewegung zu
Plate-Bewegung).

## Verdikte des Runs

| Pass | Sprecher | Verdikt | mouth_over_frame | mouth_edit | frame_edit |
|---|---|---|---|---|---|
| 0 | Sarah | NOOP | 1.299 | 2.65 | 2.04 |
| 1 | Sarah | NOOP | 1.817 | 4.63 | 2.55 |
| 2 | Samuel | MOVED | 2.950 | 9.53 | 3.23 |
| 3 | Samuel | INDETERMINATE | 2.537 | 6.28 | 2.48 |
| 4 | Matthew | MOVED | 3.075 | 6.76 | 2.20 |
| 5 | Kay | nie dispatcht (Szene vorher terminal) | — | — | — |

## Byte-/Feldgenauer Vergleich der gesendeten Requests

Geprüft an den tatsächlich gesendeten Objekten (heruntergeladen und lokal vermessen),
nicht an abgeleiteter Telemetrie.

| Merkmal | Pass 0 (NOOP) | Pass 1 (NOOP) | Pass 2 (MOVED) | Pass 4 (MOVED) |
|---|---|---|---|---|
| model / sync_mode | sync-3 / cut_off | identisch | identisch | identisch |
| ASD-Transport | bounding_boxes_url | identisch | identisch | identisch |
| auto_detect | false | false | false | false |
| Video-Codec/pix_fmt | h264 / yuv420p | identisch | identisch | identisch |
| Auflösung / FPS / timebase | 720×720 / 30 / 1/15360 | identisch | identisch | identisch |
| Frames / Dauer | 71 / 2.367 s | 41 / 1.367 s | 68 / 2.267 s | 59 / 1.967 s |
| Audiospur im Video | keine | keine | keine | keine |
| Audio (tatsächlich gesendet) | 44.1 kHz mono s16, 2.342 s | 1.354 s | 2.236 s | 1.958 s |
| Voiced-Fenster (gemessen) | 0.08–1.92 | 0.16–1.04 | 0.14–1.80 | 0.18–1.60 |
| Audio-Dauer vs. Preclip-Dauer | −0.025 s | −0.013 s | −0.031 s | −0.009 s |
| Turn-Fenster (Plate) vs. Preclip-Start | 0.000 / 0.000 | 8.443 / 8.443 | 2.492 / 2.492 | 4.878 / 4.878 |
| ASD-Boxen | 71, per Frame variabel | 41, variabel | 68, variabel | 59, variabel |
| Boxen-Anzahl == Framecount | ja | ja | ja | ja |

**Damit ausgeschlossen:** falsches Audiofenster, falsche Länge, ungünstige `cut_off`-Konstellation,
Codec-/Container-/Content-Type-Differenz, ASD-Transportdifferenz, konstante Boxen,
Serialisierungsunterschied, Upload-/URL-Differenz.

## Telemetrie-Defekt (kein Verursacher, aber irreführend)

`meta.audio_probe.bytes` und `provider_input_fingerprint.audio.*` melden für **alle** Pässe
1 323 044 Bytes / 15.0 s — das ist die **timeline-lange** WAV, nicht die tatsächlich gesendete
tight-WAV (119–207 kB, 1.35–2.34 s). Dieselbe Fehlregistrierung betrifft `lead_in_sec`
(z. B. 2.64 s bei Pass 2 — existiert in der gesendeten Datei nicht). Reines Reporting-Problem;
der Payload verweist korrekt auf die tight-WAV.

## Die einzige trennende Achse: Bildinhalt

Kontaktbögen der vier Preclips:

- **Pass 0 (NOOP):** Sarah in **nahezu vollem Profil (~90° Yaw)**, Mund über den gesamten
  Preclip nur als Silhouette sichtbar. Für ein Lip-Sync-Modell ist das kein bearbeitbarer Mund.
- **Pass 1 (NOOP):** Sarah frontal, aber praktisch bewegungsloser Kopf, Mund geschlossen.
  Das Modell hat editiert (mouth_edit 4.63), der Edit bleibt aber relativ zur Plate-Bewegung
  unter der Schwelle.
- **Pass 2 / 4 (MOVED):** frontale Gesichter, Mund vollständig sichtbar.

Messung im **Eingangs-Preclip** (Graustufen, Mund-ROI aus der Pass-Geometrie):

| Pass | Mundbewegung | Framebewegung | Ratio |
|---|---|---|---|
| 0 (NOOP) | 1.976 | 3.277 | **0.60** |
| 1 (NOOP) | 0.510 | 1.004 | **0.51** |
| 2 (MOVED) | 2.443 | 1.729 | **1.41** |
| 4 (MOVED) | 0.923 | 0.867 | **1.06** |

Die NOOP-Pässe sind genau die, bei denen im **Input** der Mundbereich weniger bewegt ist als
das Gesamtbild — d. h. der Bildeindruck wird von Kopfdrehung/Plate-Bewegung dominiert.

## Bewertung der Arbeitsannahme

Die Annahme „Fehler liegt bei uns" bleibt gültig, aber die Fehlerstelle ist **nicht** die
Request-Konstruktion. Es fehlt ein **Eignungs-Gate vor dem Dispatch**: das v461-Face-Gate prüft
`face_share`, Face-Größe, Mund-ROI und Identität, aber **nicht Kopfpose / Mundsichtbarkeit**.
Pass 0 wäre bei einer Yaw-/Mundsichtbarkeitsprüfung nie dispatcht worden — ein Profilgesicht an
sync-3 zu schicken und dann NOOP zu bewerten ist ein Integrationsfehler bei uns, kein
Provider-Qualitätsproblem.

## Zum vorgeschlagenen Cross-Swap-Kontrolltest

Für **Pass 0** ist der Test nicht mehr informativ: das Bild ist Profil, der Fehler folgt
zwangsläufig dem Video. Aussagekräftig bliebe der Swap nur für **Pass 1 (frontal, trotzdem NOOP)**
gegen Pass 2 — zwei zusätzliche Provider-Calls. Empfehlung: erst nach einer Entscheidung über das
Pose-Gate, weil ein bestandener Pose-Gate-Lauf Pass 0 ohnehin aus der Stichprobe nimmt.

## Empfehlung für V469 (eine Achse, nicht mehr)

**Pre-Dispatch-Pose-/Mundsichtbarkeits-Gate:** Für jeden Pass die Kopfpose im gewählten
Turn-Fenster prüfen; ist der Mund nicht ausreichend sichtbar, das Turn-Fenster verschieben bzw.
den Pass als `pass_unsuitable_pose` terminalisieren **ohne** Provider-Call und ohne Kosten,
statt ihn zu dispatchen und als NOOP zu bewerten.

**Kein Code, kein Dispatch in V468 — STOP.**
