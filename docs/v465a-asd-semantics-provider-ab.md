# V465-A — ASD-Box-Semantik: kontrolliertes Provider-Experiment (READ-ONLY)

Scene `be60d106-6908-4002-95d1-2bd01c5cfa6c`, Run `6739f73e-9f40-4382-89fc-2562ff99444b`.
Kein Produktionscode geändert. Sechs Provider-Calls auf eingefrorenen Artefakten.

## Fixtures

| Fixture | Pass | Sprecher | Produktions-Ergebnis |
|---|---|---|---|
| Known-NOOP | Pass 1 | Sarah Dusatko | `sync_noop_unrecoverable`, `delta_mean = -5.98` |
| Known-MOVED | Pass 3 | Samuel Dusatko | `done` |

Gleiches MP4, gleiche WAV, `model: sync-3`, `sync_mode: cut_off`. Variiert wurde
ausschließlich `active_speaker_detection`.

- **A** = aktuelle V464-per-frame-ASD (eingefrorene Wire-Boxen)
- **B** = engere gesichtsproportionale per-frame-ASD: getrackte Face-Bbox(t) → 12 % Face-Padding → Projektion durch Crop(t) → 720×720
- **C** = kein ASD

## Stufe 1 — Box-Semantik vor dem Provider-Call

| Fixture | Variante | Box/Face-Fläche | Face in Box | Bildanteil | Aspect | geklemmte Frames | Mund-Offset vom Boxzentrum |
|---|---|---|---|---|---|---|---|
| NOOP | A | 1.00 | 1.000 | 28.1 % | 0.71 | 0 | (+90, +121) |
| NOOP | B | 1.53 | 1.000 | 42.8 % | 0.72 | 31 | (+90, +119) |
| MOVED | A | 1.00 | 1.000 | 27.3 % | 0.69 | 0 | (−73, +115) |
| MOVED | B | 1.54 | 1.000 | 41.9 % | 0.69 | 0 | (−73, +115) |

Befund: Die aktuelle ASD-Box **ist** exakt die projizierte Face-Box (Faktor 1.00,
keine Randklemmung). NOOP- und MOVED-Fixture sind in Fläche, Aspect, Zentrierung
und Mundmargen praktisch identisch. Box-Semantik trennt die beiden Fälle nicht.
Die frühere y=0-Klemmung existiert in der V464-Sequenz nicht mehr.

## Stufe 2 — Ergebnis-Matrix (6 Calls, alle `COMPLETED`)

Metrik 1: Mund-ROI-Eigenbewegung (Frame-zu-Frame) wie im Produktionsverdikt.
Metrik 2: direkter Pixelvergleich Ausgabe gegen Eingabe im Mund-ROI — beweist,
ob der Provider die Mundregion überhaupt neu erzeugt hat.

| Fixture | Variante | ROI-Bewegung Eingabe | Ausgabe | delta_mean-Analog | Ausgabe vs. Eingabe | Urteil |
|---|---|---|---|---|---|---|
| NOOP | A | 8.10 | 9.11 | +1.01 | **8.16** | editiert |
| NOOP | B | 8.10 | 7.93 | −0.17 | **7.66** | editiert |
| NOOP | C | 8.10 | 8.92 | +0.82 | **8.10** | editiert |
| MOVED | A | 2.18 | 7.55 | +5.37 | 10.96 | editiert |
| MOVED | B | 2.18 | 7.27 | +5.09 | 10.13 | editiert |
| MOVED | C | 2.18 | 7.55 | +5.38 | 10.89 | editiert |

## Schlussfolgerung

1. **Keine ASD-Variante gewinnt.** A, B und C erzeugen auf beiden Fixtures
   nachweislich neue Mundpixel. Die Known-MOVED-Kontrolle wird von keiner
   Variante verschlechtert. Eine Umstellung der Box-Semantik ist damit **nicht**
   belegt und darf nicht implementiert werden.
2. **Der NOOP war kein Provider-NOOP.** Das Known-NOOP-Fixture liefert mit der
   unveränderten Produktions-Payload (Variante A) eine editierte Mundregion
   (8.16 mittlere Pixeldifferenz, Größenordnung des MOVED-Falls).
3. **Die Ursache liegt im Verdikt, nicht im Dispatch.** Das Produktionsurteil ist
   `provider.mean − preclip.mean`, eine absolute Differenz der Eigenbewegung.
   Auf einer Platte mit hoher Eigenbewegung (NOOP-Fixture: 8.10 gegenüber 2.18
   beim MOVED-Fixture) verschwindet das Lippensignal in dieser Differenz und
   kippt sogar ins Negative — genau das beobachtete `delta_mean = -5.98`. Die
   Metrik ist skalenabhängig; der bereits vorhandene skalenfreie MAD-Quotient
   (V434) läuft nur als Telemetrie mit und entscheidet nicht.

## Konsequenz für V465-B

Der Scope verschiebt sich von der Box-Semantik auf die Verdikt-Metrik. Der Fix
wäre, das Noop-Urteil auf eine plattenbewegungs-normalisierte Größe zu stellen,
statt an der ASD-Geometrie, am Crop, an Schwellen der Face-Gates oder an
Wallet-/Fence-Verträgen zu drehen. Das ist ausdrücklich noch nicht umgesetzt.
