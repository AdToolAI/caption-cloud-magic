# v431 G3.2.1 — Echter Plate-Produktions-Resmoke

Kein Code-Change, kein Redeploy, keine Migration. Ausschließlich: einen echten Lauf über die UI
auslösen, den Plate-Callback beobachten, die Vertragsbedingungen aus der Datenbank belegen und
den Bericht ergänzen.

## Ausgangslage (geprüft)

- Szene `34d223fd-405c-4179-a6b5-ed6b0c7a61ab` steht aus dem letzten Versuch auf
  `failed / lipsync_failed`, Run `5811c009…`, `plate_generation = 2`, `clip_status = generating`,
  ohne `base_video_url`/`clip_url`/`processed_video_url`.
- `composer_finalize_plate_scene` ist mit dem A-Compatibility- und `pipeline_state_at`-Fix live.
- `compose-clip-webhook` ist seit 2026-08-15T13:50:26Z deployt; nichts daran wird angefasst.

## Ablauf

1. **Vorher-Snapshot.** Kanonisches Tupel, Outputs, `plate_generation`, offene Ledger-Jobs und
   letzte Callback-Observations der Zielszene festhalten (Zeitstempel = T_start).
2. **Reset + echter UI-Run.** Szene über den regulären Reset-Flow („Lipsync komplett
   zurücksetzen") sauber stellen und die Plate-Generierung über die normale Studio-Oberfläche
   starten — kein manueller RPC-Aufruf, kein synthetischer Callback.
3. **Live-Beobachtung** bis der Provider-Callback eintrifft: Ledger-Attempt, Szene-State und
   Observations im Sekundentakt mitlesen; den State festhalten, auf den der Callback trifft
   (`plate_rendering` vs. `audio_prep`/`audio_ready`).
4. **Nachher-Auswertung** gegen die Abnahmekriterien.
5. **Bericht** `docs/v431-g3-2-1-report.md` um einen Resmoke-Abschnitt ergänzen (Run-ID,
   Zeitstempel, Vorher/Nachher-Tupel, Ledger, Observations, Verdikt) → **STOP**.

## Abnahmekriterien

| # | Kriterium | Beleg |
| --- | --- | --- |
| 1 | Callback über RPC A mit `applied = true` | Funktionslog + Ledger |
| 2 | Ledger-Job `succeeded`, genau ein Attempt gebunden | `composer_pipeline_jobs` |
| 3 | `base_video_url` und `clip_url` materialisiert, `clip_status = 'ready'` | `composer_scenes` |
| 4 | `processed_video_url` unverändert gegenüber Vorher-Snapshot | Diff |
| 5 | Observe-Verdikt `bound` | `composer_callback_observations` |
| 6 | keine `binding_pending`-/409-Serie im Fenster | Observations + Logs |
| 7 | Trifft der Callback auf `audio_prep`/`audio_ready`: alle vier Canonical-Felder exakt erhalten | Vorher/Nachher-Diff |
| 8 | Trifft er auf `plate_rendering`: Transition nach `plate_ready` mit neuem `pipeline_state_at` | Vorher/Nachher-Diff |
| 9 | Ein real eintreffender Duplicate-Callback bleibt No-op (voller Row-Diff leer) | Observations + Row-Diff |

Kriterium 7 und 8 schließen sich gegenseitig aus — es wird genau der Zweig bewertet, der real
eintritt; der andere gilt über S-A2 als abgedeckt. Kriterium 9 wird nur bewertet, wenn ein
Duplicate tatsächlich ankommt.

## Grenzen

- Kein Edge-Function-Deploy, keine DB-Migration außer reinen Lesequeries.
- Kein Eingriff in den Lauf, solange er läuft; bei Fehlschlag wird der Befund dokumentiert statt
  nachgebessert.
- Kein G3.2.2. Nach grünem Resmoke wartet die Abnahme `DONE / FROZEN` auf dich.

## Was du tun musst

Den Reset und den Start der Plate-Generierung übernehme ich nur, wenn er über die App-Oberfläche
reproduzierbar auslösbar ist; andernfalls melde ich mich mit der exakten Stelle, an der du im
Studio auf „Generieren" klicken sollst, und beobachte ab dann.
