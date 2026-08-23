# V467-A — Speech-Locked Mouth-Edit Telemetry (Ergebnisbericht)

**Status:** V467-A abgeschlossen und live als **reine Telemetrie**.
**Verdict-Autorität bleibt unverändert V465-B2b** (`mouth_over_frame`,
Band 2.00 / 2.65, Lambda-kalibriert). V467 darf kein Verdict beeinflussen.

## Was implementiert wurde

- `supabase/functions/_shared/v467-speech-lock.ts` — reine Funktion:
  WAV-Dekodierung (PCM16 / Float32), 20-ms-RMS-Sprachhüllkurve,
  Voiced/Unvoiced-Split (15 % vom Track-Peak), `v_over_u`,
  `corr_rms_zero_lag`, `corr_rms_best_lag` (±3 Frames = ±100 ms).
- `measure-provider-motion-sync.ts` — optionales `speechLockAudio`.
  Rechnet auf **denselben** bereits dekodierten Produktions-Stills;
  keine zusätzlichen Lambda-Stills, jeder Fehler wird geschluckt.
- `sync-so-webhook` + `lipsync-watchdog` — geben die Pass-Audiospur mit,
  persistieren `v467` neben `V465_VERDICT` (`authority: "telemetry_only"`)
  und geben eine `v467_speech_lock`-Logzeile aus. Die Audio-URL wandert in
  die `MOTION_PROBE`-Metadaten, damit der Watchdog dieselbe Zeitachse misst.
- Confidence-Guards: N < 16, stiller Track, degenerierter Unvoiced-Nenner
  (< 0.5 Luma) oder zu wenige Voiced/Unvoiced-Samples ⇒ `low_confidence`,
  nie eine aufgeblähte Kennzahl. In Produktion (N = 6) ist V467 daher immer
  `low_confidence`; nur ein V466-A-Grauband-Remeasure (N = 16) liefert
  `high_confidence`.

## Kalibrierung auf der eingefrorenen Kohorte

`scripts/calibration/v467/calibrate.py` (READ-ONLY, offline) rescored die
32 eingefrorenen Produktionspaare (18 MOVED / 14 NOOP, inkl. 4 GOLD) bei
N = 16 mit identischer Mouth-ROI. Rohwerte: `scripts/calibration/v467/scored.json`.

| Metrik | AUC (MOVED vs NOOP) |
|---|---|
| `mouth_over_frame` (V465, autoritativ) | **0.980** |
| `corr_rms_best_lag` | 0.853 |
| `v_over_u` | 0.806 |
| `corr_rms_zero_lag` | 0.754 |

## Befund

Die Sprachkopplung trennt die Kohorte **schlechter** als die aktuelle
autoritative Metrik. Bestätigte MOVED-Pässe erreichen häufig `v_over_u ≈ 1.0`
(GOLD0 0.98, COH19 0.98, COH20 0.77), einzelne echte NOOPs liegen darüber
(COH23 1.32 bei `corr_best` 0.81). Die in V466-B beobachtete saubere
Trennung war ein Effekt der 5 Pässe **einer** Szene und hält auf der
szenenübergreifenden Kohorte nicht.

**Konsequenz:** V467-B (Ersetzen bzw. Ergänzen des Verdicts durch die
Sprachkopplung) ist mit diesen Daten **nicht gerechtfertigt** und wird nicht
freigegeben. V467 bleibt Telemetrie und liefert ab jetzt pro Pass die
Sprachkopplungswerte für die Fehlersuche an High-Motion-Plates.
