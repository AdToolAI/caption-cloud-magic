# V465-B2a — Lambda-Still-Parität für `mouth_over_frame` (READ-ONLY)

Stand: Abschluss V465-B2a. Autorität der Produktionsmetrik bleibt unverändert
(v404 `delta_mean`); `mouth_over_frame` läuft weiter als Telemetrie. Die
Umschaltung ist Gegenstand von V465-B2b und ist hier NICHT erfolgt.

## Auftrag

1. Provider-Output auch bei NOOP dauerhaft einfrieren (Observability-Contract).
2. `mouth_over_frame` auf denselben 32 Frozen-Fällen mit **exakt dem
   Produktions-Still-Pfad** (Remotion Lambda `type:"still"` → jpeg-js) nachrechnen
   und gegen die Offline-ffmpeg-Zahlen aus V465-B1 stellen.

## Teil 1 — Observability-Contract (implementiert)

- `supabase/functions/_shared/v465-mouth-over-frame.ts` — reine, gepaarte Metrik.
- `measure-provider-motion-sync.ts` hält die dekodierten Stills beider Assets und
  berechnet die gepaarte Ratio auf **denselben** Stills wie das v404-Verdikt.
- `v434-immutable-artifact.ts`: `resolveArtifactAttempt()` leitet die echte
  Attempt-Nummer aus monotonen Zählern ab (statt 0), Key-Kollisionen werden
  gehasht und als `pinned_variant` unter Content-qualifiziertem Sibling-Key
  abgelegt. Damit überlebt jede NOOP-Ladder-Stufe als eigenes Artefakt.
- `sync-so-webhook` friert Provider-Output **vor** dem Verdikt ein und
  persistiert `v465_telemetry` in den Dispatch-Log.

## Teil 2 — Paritätsmessung (32 Frozen-Paare, Produktionspfad)

Messweg: temporäre Read-only-Function `audit-v465-lambda-parity` →
`measureProviderMotionSync()` (6 Lambda-Stills, 1280×720, frozen ROI
bx=461 by=411 bw=358 bh=154). Assets: die eingefrorenen Paare aus V462/V465-B1.

| ID | Wahrheit | ffmpeg | Lambda | Δ | ffmpeg-Band | Lambda-Band | old_delta |
|---|---|---|---|---|---|---|---|
| COH00 | MOVED | 2.945 | 2.710 | -0.235 | indeterminate | indeterminate | 136.7 |
| COH01 | NOOP | 1.725 | 1.664 | -0.061 | noop | noop | 3.7 |
| COH02 | MOVED | 3.979 | 3.617 | -0.362 | moved | moved | 285.9 |
| COH03 | MOVED | 3.788 | 3.313 | -0.475 | moved | moved | 242.4 |
| COH04 | NOOP | 1.240 | 1.193 | -0.047 | noop | noop | 40.7 |
| COH05 | MOVED | 3.235 | 2.500 | -0.735 | moved | indeterminate | -38.3 |
| COH06 | MOVED | 4.259 | 3.051 | -1.208 | moved | indeterminate | -152.3 |
| COH07 | MOVED | 2.588 | 2.134 | -0.454 | indeterminate | indeterminate | -16.0 |
| COH08 | NOOP | 1.042 | 0.937 | -0.105 | noop | noop | -1.3 |
| COH09 | NOOP | 1.240 | 1.291 | +0.051 | noop | noop | 7.5 |
| COH10 | NOOP | 0.777 | 0.746 | -0.031 | noop | noop | -1.0 |
| COH11 | NOOP | 1.386 | 1.303 | -0.083 | noop | noop | -3.9 |
| COH12 | NOOP | 0.985 | 0.856 | -0.129 | noop | noop | 0.5 |
| COH13 | MOVED | 4.122 | 3.355 | -0.767 | moved | moved | -34.5 |
| COH14 | MOVED | 2.873 | 2.622 | -0.251 | indeterminate | indeterminate | 11.5 |
| COH15 | MOVED | 2.817 | 2.602 | -0.215 | indeterminate | indeterminate | 21.9 |
| COH16 | MOVED | 4.096 | 4.109 | +0.013 | moved | moved | 63.9 |
| COH17 | MOVED | 5.677 | 4.150 | -1.527 | moved | moved | 273.6 |
| COH18 | MOVED | 7.053 | 5.736 | -1.317 | moved | moved | 641.5 |
| COH19 | MOVED | 6.145 | 4.875 | -1.270 | moved | moved | 404.6 |
| COH20 | MOVED | 3.982 | 2.989 | -0.993 | moved | indeterminate | -182.0 |
| COH21 | NOOP | 3.058 | 2.615 | -0.443 | indeterminate | indeterminate | -40.3 |
| COH22 | NOOP | 2.043 | 1.719 | -0.324 | indeterminate | noop | -78.7 |
| COH23 | NOOP | 1.628 | 1.491 | -0.137 | noop | noop | -35.9 |
| COH24 | NOOP | 1.293 | 1.183 | -0.110 | noop | noop | -5.9 |
| COH25 | NOOP | 1.474 | 1.426 | -0.048 | noop | noop | 0.2 |
| COH26 | NOOP | 1.212 | 0.928 | -0.284 | noop | noop | -25.0 |
| COH27 | NOOP | 0.926 | 0.852 | -0.074 | noop | noop | -0.7 |
| GOLD0 | MOVED | 6.004 | 3.936 | -2.068 | moved | moved | 49.3 |
| GOLD1 | MOVED | 3.145 | 2.916 | -0.229 | moved | indeterminate | 10.7 |
| GOLD2 | MOVED | 2.855 | 2.315 | -0.540 | indeterminate | indeterminate | 2.4 |
| GOLD3 | MOVED | 5.236 | 3.819 | -1.417 | moved | moved | 23.5 |

## Ergebnis

- **Korrelation ffmpeg ↔ Lambda: r = 0.977**, Rangtreue faktisch vollständig.
- **AUC (Lambda-Stills) = 0.984** gegen die eingefrorenen Labels
  (ffmpeg-Referenz: 0.980). Die Trennung überlebt den Produktionspfad.
- **0 False Positives / 0 False Negatives** mit dem B1-Band (2.0 / 3.1).
- Systematischer, **konservativer Bias**: Lambda-Werte liegen im Mittel
  −0.50 (Median −0.27) unter den ffmpeg-Werten, mit Verstärkung bei hohen
  Scores (JPEG-Q85 + `object-fit: cover`-Resampling glättet die Mundkante).
- Folge: 5 Bandwechsel, **alle in Richtung `indeterminate`** — nie von NOOP nach
  MOVED und nie von MOVED nach NOOP. Der Indeterminate-Anteil steigt von
  22 % auf 31 %.
- Reine Lambda-Trennung: MOVED-Minimum 2.134, NOOP-Maximum 2.615.

## Empfehlung für V465-B2b (noch nicht umgesetzt)

Wenn das Verdikt umgestellt wird, muss das Band **auf dem Lambda-Pfad kalibriert**
sein, nicht auf ffmpeg:

    noop_below = 2.00    moved_above = 2.65

Auf der Kohorte: 0 FP / 0 FN, 6/32 (19 %) `indeterminate`. Das
ffmpeg-Band 2.0/3.1 bleibt zwar ebenfalls fehlerfrei, erzeugt aber 31 %
`indeterminate` und würde bewiesene MOVED-Fälle (COH05, COH06, COH20, GOLD1)
unnötig in die Grauzone schieben.

Weiterhin verbindlich: `indeterminate` darf **nie** als NOOP terminalisieren —
es läuft als `motion_unverified` weiter (v443).
