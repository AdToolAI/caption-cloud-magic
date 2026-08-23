# V462 / V462-A — Provider Input Suitability: Known-Good Homepage Control vs. S01-NOOP

Status: READ-ONLY abgeschlossen. Keine Pipeline-Änderung in diesem Gate.

## A1 — Provenienz der Kontrollgruppe (bewiesen)

- Homepage-Clip `public/videos/proof-clip.mp4` = 4.331.552 Bytes, 8,04 s, 1284x718, 30 fps.
- Byte-identisch (MD5) mit dem Original-Output der Composer-Szene
  `c934a823-47de-49b7-a62e-a116b49ca3b2` (v400 Golden Run, Deutsch, 4 Sprecher).
- Damit ist die Homepage-Szene eine echte Known-Good-Kontrolle derselben Pipeline
  und desselben Providers (sync.so).

Vergleichsgruppe: `be60d106-6908-4002-95d1-2bd01c5cfa6c` (S01), Run
`14417b09-7287-4bbd-b059-94eb446491b5`, 4 Provider-Dispatches, alle terminal NOOP.

## A2 — Gemessene Artefakt-Parität (Originaldateien, nicht Telemetrie)

Alle 8 Preclips + Audios wurden aus `lipsync-plates` geladen und mit ffprobe/ffmpeg gemessen.

| Pass | Größe | Dauer | Frames | fps | Audio | Lead-in | Voiced | Peak | Global-Motion | Mundband-Motion |
|---|---|---|---|---|---|---|---|---|---|---|
| GOLD_0 | 720x720 | 1,83 s | 55 | 30 | 44,1k PCM | 0,00 s | 0,82 | -1,1 dB | 1,18 | 2,43 |
| GOLD_1 | 720x720 | 1,63 s | 49 | 30 | 44,1k PCM | 0,12 s | 0,84 | -1,1 dB | 0,73 | 1,21 |
| GOLD_2 | 720x720 | 2,20 s | 66 | 30 | 44,1k PCM | 0,16 s | 0,69 | -7,2 dB | 0,37 | 0,50 |
| GOLD_3 | 720x720 | 1,63 s | 49 | 30 | 44,1k PCM | 0,18 s | 0,58 | -1,1 dB | 0,74 | 1,27 |
| S01_0 | 720x720 | 2,37 s | 71 | 30 | 44,1k PCM | 0,08 s | 0,73 | -3,6 dB | 7,03 | 3,70 |
| S01_1 | 720x720 | 1,60 s | 48 | 30 | 44,1k PCM | 0,16 s | 0,67 | -4,5 dB | 1,42 | 1,22 |
| S01_2 | 720x720 | 2,30 s | 69 | 30 | 44,1k PCM | 0,10 s | 0,75 | -7,4 dB | 1,06 | 1,05 |
| S01_3 | 720x720 | 2,17 s | 65 | 30 | 44,1k PCM | 0,12 s | 0,58 | -2,7 dB | 1,93 | 1,63 |

**Kein Unterschied** in: Container/Codec, Auflösung, fps, Frame-Count-Plausibilität,
A/V-Längenparität, Audio-Samplerate/-Format, Lead-in, Voiced-Ratio, Pegel.
Damit sind Transport, Encoding und Audio als NOOP-Ursache ausgeschlossen.

## Der eine belastbare Unterschied: Framing (Face-Fraction im Preclip)

Pose- und Framing-Messung auf identischen Mid-Frames (Vision-Klassifikation):

| Pass | yaw | Mund voll sichtbar | **Gesichtsanteil am Frame** | Ergebnis |
|---|---|---|---|---|
| GOLD_0 | 60° | ja | **0,18** | moved |
| GOLD_1 | 45° | ja | **0,15** | moved |
| GOLD_2 | 30° | ja | **0,15** | moved |
| GOLD_3 | 5° | ja | **0,06** | moved |
| S01_0 | 65° | ja | **0,75** | NOOP |
| S01_1 | 75° | ja | **0,45** | NOOP |
| S01_2 | 45° | ja | **0,45** | NOOP |
| S01_3 | 45° | ja | **0,40** | NOOP |

Befunde:

1. **Profil-Hypothese widerlegt.** GOLD_0 lief mit 60° Yaw erfolgreich; S01_2/S01_3
   scheiterten bei 45°. Yaw trennt die Gruppen nicht.
2. **Framing trennt sie vollständig und überlappungsfrei.** Erfolgreiche Passes liegen
   bei 0,06–0,18 Gesichtsanteil (Halbnah, Kopf + Schultern + Kontext). Alle NOOPs liegen
   bei 0,40–0,75 (extreme Großaufnahme, Kopf füllt den Rahmen, wenig bis kein Rand).
3. **Crop-Geometrie bestätigt das.** GOLD-Crops: 220–250 px Quellregion aus der 1284er
   Platte; S01-Crops: 304–326 px — bei nur zwei sehr großen Personen in der Platte.
   Der Kopf belegt dadurch fast die gesamte 720er Ausgabe.
4. **Unser Face-Gate kennt nur eine Untergrenze.** v461 misst face_share 0,288–0,291 und
   lässt frei (Floor 0,24). Es gibt keine Obergrenze und keine Mindest-Randmarge — genau
   der Bereich, in dem alle NOOPs liegen.
5. Nebenbefund: S01_0 hat mit 7,03 die mit Abstand höchste Global-Motion (Kamera/Körper
   in der Platte). Das ist ein Verstärker, aber kein Trenner — S01_1/2/3 liegen im
   GOLD-Bereich und scheiterten trotzdem.

## Schlussfolgerung

Sync.so liefert NOOP, wenn der Preclip eine extreme Großaufnahme ist: das Gesicht belegt
≥ ~0,40 des Frames, Kopfoberkante/Kinn/Schultern fehlen und es bleibt kaum Rand.
Der Known-Good-Kontrollfall arbeitet konsistent im Halbnah-Fenster (~0,06–0,18).
Der Provider braucht Kopf-plus-Kontext-Framing, nicht maximale Mundauflösung.

## Empfehlung für das nächste (schreibende) Gate — V463, nicht Teil dieses Gates

- Preclip-Framing-Kontrakt mit **Ober**grenze: Ziel-Gesichtsanteil ~0,12–0,25, harte
  Obergrenze bei 0,32; Crop bei Überschreitung herauszoomen statt heranzuziehen.
- Mindest-Randmarge: Kopfoberkante und Kinn dürfen den Frame nicht berühren
  (z. B. ≥ 8 % Rand oben/unten).
- Face-Gate um diese beiden Prüfungen erweitern (Symmetrie zum bestehenden 0,24-Floor)
  und den Verstoß vor dem Dispatch mit Refund abbrechen bzw. Crop korrigieren.
