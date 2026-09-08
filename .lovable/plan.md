# Video Enhance — Orchestrierung: sofortige Speicherung, mehrere Jobs, Job-Center

Umgebaut wird ausschließlich die **Auslösung** der Speicherung und die **Sichtbarkeit** laufender Jobs. Die bereits validierte Übertragung bleibt Zeile für Zeile bestehen.

## Bestätigung: was NICHT angefasst wird

`supabase/functions/_shared/video-enhance-transfer.ts` und der Transferteil von `video-enhance-finalize.ts` bleiben unverändert: fortsetzbarer Upload, 6-MB-Chunks, gespeicherter Byte-Offset, deterministischer Zielpfad `<user>/video-enhance/<run>.mp4`, 60-s-Zeitbudget, Retry `[0, 2, 5, 15, 30]` Minuten, `manual_review` ohne Erstattung. Kein Zurück zu `arrayBuffer`. Ebenso unverändert: Preise, Wallet, Erstattungsschlüssel, Provider-Routing, Lip-Sync, Director's Cut.

## Ist-Zustand (im Code verifiziert)

- Zustände: `credits_reserved → provider_submitting → provider_submitted → provider_processing → provider_output_ready → asset_staging → asset_persisting → completed`, daneben `cancel_requested`, `local_poll_timeout`, `asset_persist_failed`, `provider_failed`, `output_lost`, `provider_cancelled_confirmed`, `manual_review`.
- Replicate/vCube: signierter Webhook setzt `provider_output_ready` + `next_persist_at = now()`, speichert aber nicht.
- Topaz: kein Webhook; Erfolg wird heute nur vom Reconciler erkannt. Der Browser-Poll wertet nur Ablehnungen aus.
- Speicherung läuft ausschließlich in `video-enhance-reconcile`, alle 5 Minuten, **ein** `video_enhance_claim_persist_run` pro Aufruf → 5–10+ Minuten Wartezeit.
- `open_run` liefert nur den neuesten offenen Run; `useEnhanceVideo` hält genau einen Run.

## A. Sofortige Speicherung

Neue interne Edge-Funktion **`video-enhance-persist`** (gleicher Guard wie der Reconciler, kein Nutzer-JWT, Body wird nie gelesen): claimt in einer Schleife bis zu ihrem Zeitbudget Runs über dieselbe Claim-RPC und ruft dieselbe `finalizeSuccess`-Logik. Kein zweiter Transferpfad.

Ausgelöst wird sie fire-and-forget direkt nach dem Setzen von `provider_output_ready` durch:
- `video-enhance-webhook` (Replicate/ByteDance vCube — primärer Trigger),
- `video-enhance-poll` (Topaz, siehe F),
- `video-enhance-reconcile` (nur Wächter).

Der Browser löst nichts aus und besitzt keinen Job. Fehler beim Trigger werden nur protokolliert — der Cron fängt sie auf.

## B. Claim/Lease bleibt

`video_enhance_claim_persist_run` bleibt der einzige Eingang in schwere Arbeit: ein atomares `UPDATE ... FOR UPDATE SKIP LOCKED` mit Lease (240 s). Webhook, Poller und Cron dürfen rennen — genau einer bekommt den Run, die anderen bekommen `null` und beenden geräuschlos. Auslösen ist damit idempotent; `finalizeSuccess` schließt zusätzlich bei `completed` kurz.

## C. Nebenläufigkeit

Die Claim-RPC bekommt zwei Parameter, ausgewertet gegen aktive Leases:
- `p_max_global` (Standard 3),
- `p_max_per_user` (Standard 1).

Werte kommen aus einer einzigen Konstantenquelle (`_shared/video-enhance-runtime.ts`, per Function-Secret überschreibbar) — keine verstreuten Zahlen. Überzählige Runs bleiben einfach `provider_output_ready` und werden beim nächsten freien Platz geclaimt; nichts schlägt fehl. Fairness: die Claim-Auswahl sortiert nach ältestem Run pro Nutzer, sodass ein Nutzer mit vielen Jobs die anderen nicht aushungern kann.

## D. Mehrere Jobs im Frontend

- Neue Aktion `open_runs` in `video-enhance/index.ts`: alle nicht-terminalen Runs des angemeldeten Nutzers. `open_run` bleibt unverändert erhalten.
- `src/hooks/useEnhanceVideo.ts`: Map `runId → run` mit eigenem Poll je Run; `run`/`isRunning` bleiben als abgeleitete Felder für bestehende Aufrufer.
- `EnhanceVideoPanel`: Start ist nie blockiert, Auswahl bleibt bedienbar, je Job eine eigene Fortschritts- und Abbruchkarte. Abbruch wirkt nur auf die übergebene `runId`.
- Nach Neuladen/Navigation werden alle offenen Runs wiederhergestellt.

## E. Globales Job-Center

Kleiner App-weiter Indikator (Popover im Header, sichtbar sobald offene Runs existieren), gespeist aus `open_runs`: Titel/Vorschaubild sofern vorhanden, Anbieter/Modell, Zielauflösung + FPS, aktuelle Phase, Abbrechen für genau diesen Job. Angezeigte Phasen: In Warteschlange · Verbessern · Anbieter rechnet · Datei wird gesichert · Sicherung wird wiederholt · Manuelle Prüfung. Zusätzlich zeigt die History (`VideoGenerationHistory` / `videoHistory/model.ts`) offene Runs als laufende Einträge — derselbe Eintrag wechselt beim Abschluss auf „Fertig", ohne zweite Zeile.

## F. Topaz Backend-Poller

Neue Edge-Funktion **`video-enhance-poll`** (intern, per pg_cron jede Minute): liest fällige Topaz-Runs über `next_reconcile_at` und die bestehende `readProviderPrediction`, setzt bei Erfolg `provider_output_ready` und stößt sofort `video-enhance-persist` an. Backoff: 15 s in den ersten 2 Minuten, dann 30 s bis 10 Minuten, danach 60 s, gedeckelt bei 5 Minuten — je Run in `next_reconcile_at` gespeichert, damit ein zusätzlicher Aufruf nie Provider-Verkehr erzeugt. Der bestehende 5-Minuten-Reconciler bleibt daneben als Wächter.

## G. Sicherheit bleibt

Siehe oben — Transfer, Retry, `manual_review`, Wallet und Erstattungen bleiben unverändert.

## H. Tests

Neu bzw. erweitert:
- Provider-Abschluss → Speicherung startet in Sekunden (Trigger-Aufruf nachgewiesen, nicht Cron-abhängig).
- Webhook + Poller + Cron gleichzeitig → genau ein Transfer (Claim gibt einmal einen Run zurück).
- Zwei parallele Jobs eines Nutzers koexistieren; Grenzen 3 global / 1 pro Nutzer greifen.
- Abbruch eines Jobs lässt andere unberührt.
- Neuladen/Navigation stellt alle offenen Jobs wieder her.
- Fortsetzung großer Dateien ab gespeichertem Offset; kein Vollpuffer im Speicher.
- Keine doppelte Belastung/Erstattung.
- Abgeschlossene Jobs erscheinen in History/Mediathek — derselbe Eintrag, kein Duplikat.
- Lease-Ablauf und Wiederaufnahme durch den nächsten Worker.
- Lasttest: 3 Nutzer × 2 gleichzeitige 4K-Jobs mit dicht beieinander liegenden Provider-Abschlüssen — globale Grenze 3 und Nutzergrenze 1 eingehalten, keine Aushungerung, keine doppelte Speicherung, keine doppelte Abrechnung, jeder Run sichtbar und terminal.

## Manueller Abnahmetest

Upscale starten → wegnavigieren → History zeigt den laufenden Job mit Backend-Status → Neuladen → weiterhin sichtbar und aktualisierend → Tab schließen, neu anmelden → Job wieder da → nach Abschluss wechselt derselbe Eintrag auf „Fertig", kein Duplikat.

## Rollout

1. Claim-RPC um `p_max_global`/`p_max_per_user` erweitern (bei 1/1 verhaltensneutral).
2. `video-enhance-persist` deployen, zunächst nur vom Reconciler gerufen.
3. Sofort-Trigger im Webhook aktivieren, vCube-Lauf messen.
4. `video-enhance-poll` + Minuten-Cron für Topaz.
5. `open_runs`, Hook-Umbau, Job-Center, History-Anzeige offener Runs.
6. Tests, Typecheck, Build, danach manueller Abnahmetest.

## Betroffene Dateien

Neu: `supabase/functions/video-enhance-persist/index.ts`, `supabase/functions/video-enhance-poll/index.ts`, `src/components/jobs/EnhanceJobCenter.tsx`, Testdateien.
Geändert: `supabase/functions/video-enhance/index.ts` (`open_runs`), `video-enhance-webhook/index.ts`, `video-enhance-reconcile/index.ts`, `_shared/video-enhance-runtime.ts` (Grenzwerte + Trigger-Helfer), Migration für die Claim-RPC, `src/hooks/useEnhanceVideo.ts`, `src/components/ai-video/EnhanceVideoPanel.tsx`, `src/lib/videoHistory/model.ts` + `VideoGenerationHistory.tsx`, Übersetzungen EN/DE/ES.
