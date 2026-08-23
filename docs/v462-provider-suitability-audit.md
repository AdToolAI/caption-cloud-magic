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


---

# Abschnitt B — Zeitfenster, Pose und Framing über eine 36-Pass-Kohorte

Strikt READ-ONLY erhoben. Kein Lauf, kein Dispatch, keine Pipeline-Änderung.

## Unabhängige Labels (nicht aus unserer Motion-Gate übernommen)

Für jeden Pass mit vorhandenem Provider-Output wurde der Output pixelweise gegen den
dispatchten Preclip gestellt (beide 720x720, gleiche Frame-Zahl). Ein echter Lip-Sync
erzeugt eine räumlich eng begrenzte Änderung auf Mundhöhe. Label:

- **MOVED**: Peak der mittleren Differenz >= 15 auf Höhe y 0,45–0,82 mit Fokus >= 0,12
- **NOOP**: keine mundlokalisierte Änderung

Das Verfahren ist von unserer Pipeline unabhängig und bestätigt sie an beiden Ankern:
Homepage-Golden-Run = 4/4 MOVED, S01 = 4/4 NOOP (dort gibt es keinen Output, der
Provider gab den Input durch).

Kohorte: 36 Pässe aus 12 Szenen (1–4 Sprecher), davon **18 MOVED / 18 NOOP**.
Alle mit identischen Provider-Parametern: `sync-3`, `bounding_boxes_url`, `cut_off`,
`bbox-url-pro`. Provider-Parameter sind damit als Ursache ausgeschlossen.

## Ergebnis 1 — Timing trennt NICHT

| Merkmal | MOVED (Median) | NOOP (Median) | AUC |
|---|---|---|---|
| Sprachbeginn t0 | 0,14 s | 0,14 s | 0,556 |
| Bildbewegung vor Sprachbeginn | 0,94 | 1,67 | 0,696 |
| Mundbewegung vor Sprachbeginn | 1,53 | 1,32 | 0,487 |
| Bewegung in den ersten 500 ms | 0,86 | 1,73 | 0,657 |
| Voiced-Ratio | 0,749 | 0,730 | 0,446 |
| Preclip-Dauer | 2,40 s | 2,34 s | 0,466 |

Die Hypothese "SUCCESS hat einen ruhigen Vorlauf, NOOP startet mitten in der Bewegung"
ist widerlegt. GOLD_0 hat t0 = 0,00 s (Sprache ab dem ersten Frame) und lief erfolgreich;
mehrere NOOPs haben einen ruhigen Vorlauf. Vorlaufbewegung ist bestenfalls ein schwacher
Risikofaktor (AUC 0,70), kein Trenner.

## Ergebnis 2 — Framing trennt NICHT (Abschnitt A korrigiert)

Der Gesichtsanteil im Frame trennt in der großen Kohorte **umgekehrt** zur 4-gegen-4-Ablesung
aus Abschnitt A: AUC 0,333 zugunsten von MOVED bei größeren Gesichtern.
MOVED reicht von 0,10 bis **0,85**, NOOP von 0,00 bis 0,80.

Die Aussage aus Abschnitt A ("Gesichtsanteil >= 0,40 verursacht NOOP") gilt damit als
**widerlegt**. Sie war ein Artefakt der kleinen Stichprobe. Eine Framing-Obergrenze im
Face-Gate wäre ein Fehler — sie hätte 8 der 18 erfolgreichen Pässe blockiert.

## Ergebnis 3 — Was tatsächlich korreliert

| Signal | AUC / Trefferquote |
|---|---|
| **Kopf-Yaw (Betrag)** | AUC 0,711 — stärkstes Einzelmerkmal |
| yaw >= 70° | 5 von 5 NOOP |
| yaw >= 60° | 6 von 7 NOOP |
| **Kein/winziges Gesicht am t0-Frame** (faces=0 oder FaceFrac < 0,05) | 5 von 5 NOOP |
| Kombinierte Risiko-Regel (yaw >= 60° ODER degenerierter Crop) | 11 markiert, davon 10 NOOP |

Präzision der Risiko-Regel: 91 %. **Recall nur 56 %** — 8 NOOPs bleiben unmarkiert,
also technisch einwandfreie, frontale, gut gerahmte Inputs, bei denen sync-3 trotzdem
nichts tut.

S01 liegt genau im Risikoband: Yaw 45°/60°/70°/75° — der höchste Yaw-Cluster der
gesamten Kohorte neben drei weiteren NOOP-Fällen.

## Ergebnis 4 — NOOP tritt szenenweise auf, nicht passweise

| Szene | NOOP / Pässe |
|---|---|
| GOLD (Homepage) | 0 / 4 |
| dd77656e | 0 / 4 |
| a787a948 | 0 / 3 |
| 5c35a170 | 0 / 3 |
| a01f4d84 | 1 / 4 |
| c7b895f4 | 2 / 3 |
| 90aa26ee | **4 / 4** |
| c01d339d | **4 / 4** |
| S01 (be60d106) | **4 / 4** |

Zwei historische Szenen sind vollständig NOOP, obwohl alle Pässe damals als `done`
gebucht wurden — der Fehler ist also älter als S01 und wurde bis zur Einführung des
Motion-Gates schlicht nicht bemerkt. Das All-or-Nothing-Muster spricht für eine
Eigenschaft der Platte (Plate-Look, Renderer-Charakteristik, Textur) statt für ein
Merkmal des einzelnen Sprechers.

## Schlussfolgerung

Vier Ursachenklassen sind jetzt gemessen und ausgeschlossen:

- A) zeitliches Preclip-Fenster / Lead-in — kein Trenner (AUC 0,56)
- C) Audio-Timing, Voiced-Ratio, Pegel, Dauer — kein Trenner
- D) Provider-Input-Struktur (Modell, ASD-Modus, sync_mode, Variante) — in der ganzen
  Kohorte identisch
- Framing / Gesichtsanteil — kein Trenner, Abschnitt-A-Befund widerlegt

Übrig bleiben:

- B) **starke Profilansicht (yaw >= 60°)** — verlässlicher Risikofaktor, deckt aber nur
  einen Teil der NOOPs ab
- Degenerierte Crops ohne erkennbares Gesicht im Startframe — sicherer NOOP
- E) **sync-3 ist auf bestimmten Platten grundsätzlich unzuverlässig** — 8 von 18 NOOPs
  haben einen sauberen, frontalen, gut gerahmten Input, und das Muster ist szenenweise
  konstant

Damit ist E keine Restwahrscheinlichkeit mehr, sondern die Mehrheitserklärung.

## Empfehlung für das nächste (schreibende) Gate

1. **Keine Framing-Obergrenze einbauen.** Der in Abschnitt A vorgeschlagene V463-Kontrakt
   ist zurückzuziehen.
2. Preflight-Prüfungen mit belegter Trennschärfe ergänzen: Abbruch bzw. anderer
   Sprecherframe bei yaw >= 60° und bei degeneriertem Crop (kein Gesicht im t0-Frame).
   Das verhindert nachweislich rund die Hälfte der NOOPs vor dem Dispatch — mit Refund
   statt Ladder-Verbrennung.
3. Für den Rest: **Provider-Wechsel statt Input-Reparatur.** Der zertifizierte
   Zweit-Provider (HappyHorse / Hailuo) ist auf derselben Platte gegenzutesten,
   bevor weitere sync-3-Läufe bezahlt werden. Vorschlag: ein einzelner A/B-Lauf auf der
   bekannten All-NOOP-Platte S01 mit identischem Preclip und identischem Audio.

## Rohdaten (36 Pässe)

FaceFrac und Yaw sind am Frame zum Sprachbeginn gemessen; Peak/PeakY beschreiben die
vom Provider tatsächlich veränderte Bildregion.

| Pass | Szene | Label | FaceFrac | Yaw | Faces | Edge | t0 s | PreMotion | PreMouth | First500 | Motion | Voiced | Dauer | Peak | PeakY |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| COH13 | 5c35a170 | MOVED | 0.15 | 15 | 3 | False | 0.06 | 1.334 | 3.556 | 2.617 | 2.775 | 0.802 | 2.53 | 34.42 | 0.65 |
| COH14 | 5c35a170 | MOVED | 0.15 | 55 | 2 | True | 0.08 | 1.298 | 1.07 | 1.379 | 1.366 | 0.776 | 3.33 | 20.72 | 0.57 |
| COH15 | 5c35a170 | MOVED | 0.25 | 15 | 2 | True | 0.12 | 1.499 | 8.196 | 0.9 | 0.375 | 0.719 | 3.1 | 37.31 | 0.61 |
| GOLD0 | GOLD | MOVED | 0.18 | 35 | 1 | False | 0.0 | None | None | 2.205 | 1.117 | 0.824 | 1.83 | 26.76 | 0.64 |
| GOLD1 | GOLD | MOVED | 0.25 | 45 | 1 | False | 0.12 | 0.482 | 1.933 | 0.828 | 0.67 | 0.84 | 1.63 | 36.37 | 0.66 |
| GOLD2 | GOLD | MOVED | 0.15 | 30 | 1 | False | 0.16 | 0.279 | 0.565 | 0.307 | 0.341 | 0.688 | 2.2 | 22.77 | 0.61 |
| GOLD3 | GOLD | MOVED | 0.1 | 15 | 1 | False | 0.18 | 0.592 | 1.214 | 0.596 | 0.673 | 0.58 | 1.63 | 34.51 | 0.61 |
| COH00 | a01f4d84 | MOVED | 0.4 | 0 | 1 | True | 0.16 | 4.28 | 4.017 | 2.54 | 1.349 | 0.723 | 2.27 | 37.38 | 0.64 |
| COH02 | a01f4d84 | MOVED | 0.7 | 0 | 1 | True | 0.16 | 0.634 | 1.177 | 0.463 | 1.204 | 0.662 | 2.63 | 47.42 | 0.62 |
| COH03 | a01f4d84 | MOVED | 0.65 | 0 | 1 | True | 0.16 | 0.509 | 0.61 | 0.441 | 0.232 | 0.764 | 2.57 | 76.84 | 0.62 |
| COH05 | a787a948 | MOVED | 0.19 | 5 | 1 | False | 0.06 | 0.68 | 1.533 | 0.525 | 7.334 | 0.781 | 2.6 | 18.47 | 0.52 |
| COH06 | a787a948 | MOVED | 0.35 | 45 | 1 | False | 0.16 | 3.969 | 4.639 | 6.015 | 1.821 | 0.645 | 4.3 | 26.87 | 0.52 |
| COH07 | a787a948 | MOVED | 0.45 | 65 | 1 | True | 0.1 | 3.83 | 8.984 | 3.166 | 1.852 | 0.734 | 1.6 | 40.27 | 0.57 |
| COH20 | c7b895f4 | MOVED | 0.15 | 20 | 2 | True | 0.02 | 1.532 | 4.139 | 3.037 | 3.712 | 0.804 | 2.17 | 17.88 | 0.51 |
| COH16 | dd77656e | MOVED | 0.4 | 30 | 1 | True | 0.04 | 6.94 | 11.535 | 2.178 | 1.383 | 0.664 | 2.23 | 37.39 | 0.55 |
| COH17 | dd77656e | MOVED | 0.45 | 5 | 1 | True | 0.16 | 0.353 | 0.465 | 0.415 | 0.378 | 0.79 | 2.0 | 57.37 | 0.56 |
| COH18 | dd77656e | MOVED | 0.85 | 0 | 1 | True | 0.26 | 0.458 | 0.427 | 0.437 | 0.518 | 0.672 | 2.77 | 95.41 | 0.58 |
| COH19 | dd77656e | MOVED | 0.65 | 0 | 1 | True | 0.16 | 0.943 | 0.479 | 0.801 | 0.664 | 0.785 | 2.53 | 88.12 | 0.55 |
| COH12 | 13f467b1 | NOOP | 0.0 | 0 | 0 | False | 0.04 | 1.831 | 1.083 | 1.624 | 1.577 | 0.781 | 3.07 | 7.1 | 0.28 |
| COH08 | 90aa26ee | NOOP | 0.25 | 75 | 1 | True | 0.16 | 5.337 | 1.104 | 2.623 | 1.222 | 0.653 | 2.5 | 9.01 | 0.39 |
| COH09 | 90aa26ee | NOOP | 0.15 | 45 | 1 | True | 0.16 | 0.853 | 1.685 | 0.502 | 0.663 | 0.79 | 2.0 | 3.8 | 0.93 |
| COH10 | 90aa26ee | NOOP | 0.12 | 40 | 2 | True | 0.26 | 0.816 | 0.426 | 0.699 | 0.645 | 0.656 | 2.53 | 13.88 | 0.21 |
| COH11 | 90aa26ee | NOOP | 0.15 | 70 | 1 | True | 0.16 | 0.447 | 0.197 | 0.35 | 0.581 | 0.764 | 2.5 | 10.27 | 0.72 |
| COH23 | 9267e69b | NOOP | 0.0 | 90 | 0 | False | 0.12 | 5.493 | 5.537 | 3.203 | 1.699 | 0.691 | 1.4 | 29.88 | 0.55 |
| S01_0 | S01 | NOOP | 0.65 | 70 | 1 | True | 0.08 | 9.06 | 3.832 | 7.78 | 6.616 | 0.726 | 2.37 | None | None |
| S01_1 | S01 | NOOP | 0.8 | 75 | 1 | True | 0.16 | 1.367 | 1.202 | 1.613 | 1.306 | 0.671 | 1.6 | None | None |
| S01_2 | S01 | NOOP | 0.65 | 60 | 1 | True | 0.1 | 1.963 | 1.942 | 1.899 | 1.006 | 0.746 | 2.3 | None | None |
| S01_3 | S01 | NOOP | 0.55 | 45 | 1 | True | 0.12 | 0.857 | 0.611 | 0.774 | 1.851 | 0.579 | 2.17 | None | None |
| COH01 | a01f4d84 | NOOP | 0.4 | 0 | 1 | True | 0.14 | 1.045 | 2.869 | 1.821 | 1.38 | 0.797 | 2.0 | 9.55 | 0.47 |
| COH24 | c01d339d | NOOP | 0.04 | 20 | 2 | True | 0.18 | 5.433 | 10.158 | 3.474 | 1.93 | 0.67 | 2.27 | 1.06 | 0.85 |
| COH25 | c01d339d | NOOP | 0.55 | 35 | 1 | True | 0.14 | 0.955 | 1.404 | 0.837 | 1.022 | 0.8 | 2.0 | 5.86 | 0.48 |
| COH26 | c01d339d | NOOP | 0.0 | 0 | 0 | False | 0.26 | 6.39 | 6.221 | 6.407 | 4.904 | 0.705 | 2.67 | 7.35 | 0.48 |
| COH27 | c01d339d | NOOP | 0.15 | 35 | 2 | True | 0.14 | 1.261 | 0.307 | 1.643 | 1.224 | 0.791 | 2.67 | 8.55 | 0.35 |
| COH21 | c7b895f4 | NOOP | 0.15 | 10 | 3 | True | 0.1 | 1.505 | 1.217 | 1.468 | 1.875 | 0.924 | 2.67 | 13.43 | 0.6 |
| COH22 | c7b895f4 | NOOP | 0.12 | 20 | 2 | True | 0.14 | 2.608 | 1.226 | 2.814 | 2.648 | 0.605 | 3.37 | 10.98 | 0.32 |
| COH04 | f663b958 | NOOP | 0.012 | -58.42398452758789 | 2 | False | 0.08 | 44.083 | 34.684 | 13.165 | 9.756 | 0.733 | 1.77 | 7.96 | 0.52 |
