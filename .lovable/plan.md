# V467 — Verdict gegen die Sprachhüllkurve normalisieren

## Zuerst: Was unterscheidet den v400-Golden-Run von der heutigen S01-Szene?

Belegt aus `docs/lipsync-golden-run-v400.md`, der V465-B1-Kohorte (`.tmp_table_b.md`)
und dem heutigen V466-B-Bericht — **die Pipeline-Verträge T1–T16 sind identisch**.
Der Payload von heute (`sync-3`, `preclip_used`, `asd_auto_detect:false`, Clip-Raum,
`sync_mode:cut_off`, options nur `sync_mode`+`active_speaker_detection`) ist Feld für Feld
derselbe wie der v400-Referenzpayload. Unterschiedlich sind drei Dinge:

| Achse | v400 Golden Run | S01 heute |
|---|---|---|
| Gesichter im Preclip-Frame | 1 (GOLD0–GOLD3 durchgehend `Faces=1`) | 1 Zielgesicht, aber Nachbarn am Rand (`Edge=True` bei 4/5 Pässen) |
| Kopfdrehung | Yaw 15–45° | Yaw 45–75° bei den NOOP-Pässen |
| Bildbewegung im Preclip vor Sprachbeginn | 0.28–0.59 | 0.86–9.06 |
| Verdict-Metrik | `old_delta` (Output-minus-Input-Gesamtbewegung) | seit V465-B2b `mouth_over_frame` |

Der entscheidende Punkt ist die letzte Zeile in Kombination mit der vorletzten:
Beide Metriken normalisieren mundspezifische Änderung gegen **Gesamtbild-Bewegung**.
Bei v400 war die Plate ruhig, der Nenner klein — jeder echte Sync fiel deutlich aus.
Bei S01 bewegen sich Kamera und Köpfe stark, der Nenner wächst, und ein echter Sync
rutscht rechnerisch nach unten. V466-B hat das an derselben Plate gemessen: Pass 0/1
werden vom Provider mundlokalisiert bearbeitet (Pass 1 erhöht die Mundbewegung um
Faktor 6.65), aber nicht sprachgekoppelt; Pass 3 ist sprachgekoppelt wie die MOVED-Pässe
und wird nur durch die Normalisierung grau.

Es liegt also **kein v400-Regress in der Kette** vor. Was fehlt, ist eine Metrik, die
szenenbewegungsfrei misst.

## Umfang V467 (eng, eine Achse)

1. Neue Kennzahl `speech_locked_mouth_edit` neben `mouth_over_frame`:
   - `v_over_u` = mittlerer Mund-Edit in voiced Frames / in unvoiced Frames
   - `corr_rms` = Korrelation des Mund-Edits mit der Sprachhüllkurve des gesendeten Audios
   - Voiced-Erkennung: 20-ms-RMS-Fenster, Schwelle 15 % des Peaks (wie im V466-B-Skript)
2. **Zuerst nur Telemetrie.** V467-A schreibt beide Werte in `syncso_dispatch_log.meta.v467`,
   ohne das Verdict zu berühren. `mouth_over_frame` bleibt autoritativ.
3. Kalibrierung auf der bestehenden Frozen-Kohorte (32 Pässe V465-B1 + die 5 gepinnten
   S01-Pässe) offline nachrechnen, AUC und Trennbereich bestimmen, in
   `docs/v467-speech-locked-metric.md` festhalten.
4. Erst wenn die Kohorte eine überlappungsfreie Trennung bestätigt, kommt V467-B als
   separates Gate: Umschaltung des Verdicts bzw. Nutzung als Tie-Breaker im Grauband.

Aus V466-B liegen für die 5 S01-Pässe bereits Werte vor: NOOP 1.22 / 1.53 (corr 0.20 / 0.42)
gegen MOVED+GRAY 2.01 / 2.21 / 2.26 (corr 0.57 / 0.59 / 0.67) — 5 von 5 korrekt getrennt,
wo `mouth_over_frame` 3 von 5 trennt. Das ist die Hypothese, die V467-A prüfen soll.

## Technische Details

- Neue Datei `supabase/functions/_shared/v467-speech-lock.ts`: nimmt die bereits dekodierten
  Stills aus `measure-provider-motion-sync.ts` plus das dispatchte Audio, liefert
  `{ v_over_u, corr_rms, voiced_frames, samples }`. Keine zusätzlichen Lambda-Calls —
  es werden dieselben Stills verwendet, die V465 ohnehin zieht.
- Für belastbare voiced/unvoiced-Statistik reichen 6 Stills nicht; V467-A nutzt die
  V466-A-Re-Measure-Stufe (16 Stills) und markiert Ergebnisse mit N<16 als
  `speech_lock_low_confidence` — reine Telemetrie, kein Gate.
- `sync-so-webhook` und `lipsync-watchdog`: nur Persistenz der neuen Felder, keine
  Verzweigung. Grauband-Fall-Through aus V466-A bleibt unverändert.
- Offline-Kalibrierung als Skript unter `scripts/calibration/v467/`, gegen die gepinnten
  Artefakte in `v434_artifact_pins`.
- Tests: `v467-speech-lock.test.ts` mit synthetischen Fällen (konstanter Edit → v_over_u ≈ 1,
  sprachsynchroner Edit → v_over_u > 2, stille Spur → `low_confidence`).

## Nicht in diesem Gate

- Keine Änderung an Verdict, Bandgrenzen, ASD-Projektion, Crop-Geometrie oder Provider-Wahl.
- Kein neuer S01-Lauf.
