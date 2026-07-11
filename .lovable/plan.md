
# v231 – Sauberer Fix: Motion Content Gate für Einzelsprecher

## Ziel
N=1-Szenen dürfen nicht mehr mit einem statischen Sync.so-Output („Noop") als erfolgreich markiert werden. Der Kunde bekommt entweder ein sichtbar animiertes Lip-Sync-Overlay oder einen sauberen Retry + automatischen Credit-Refund – niemals einen eingefrorenen Sprecher.

## Warum dieser Ansatz
Der einfache Zwischenweg („v150-Suppress zurücknehmen") flickt nur ein Symptom und öffnet frühere Fehlerklassen wieder. Der professionelle Weg ist, die bereits für Multi-Speaker etablierte **Motion Content Gate (v113)** konsequent auch auf N=1 anzuwenden – gleiche Logik, gleiche Qualitätsschwelle, kein Sonderpfad mehr.

## Umfang (nur N=1-Pfad in `compose-dialog-segments` / Sync-Webhook)

1. **Motion-Probe im Webhook aktivieren**
   - Nach Erhalt des Sync.so-Ergebnisses: FFprobe/Frame-Diff auf dem voiced Window (nicht dem Tail-Hold).
   - Metriken: `sizeRatio`, `motionAmplification`, `lipRegionΔ` – identische Schwellen wie Multi-Cast.
   - Ergebnis wird als `motion_gate: pass|noop|weak` im Scene-Log persistiert.

2. **Retry-Ladder vereinheitlichen**
   - Bei `noop`/`weak`: gleiche Ladder wie N≥2 (Prompt-Reinforce → Model-Bump → Re-Preclip), max. 2 Retries.
   - Nach letztem Retry ohne Pass: Scene → `failed`, `twoshot_stage=failed`, sauberer Fehlertext.

3. **v150-Suppress gezielt aufheben – nur für N=1**
   - Der byte-basierte Fallback-Check bleibt für Multi-Cast aus (kein Regress), wird aber im N=1-Pfad als *zusätzlicher* Kanary reaktiviert, falls die Motion-Probe unerwartet fehlschlägt.

4. **Automatischer Credit-Refund**
   - Bei endgültigem Fail idempotenter Refund über die bestehende `refund_scene_credits`-RPC (gleiche Policy wie Lambda-Timeouts).

5. **Progress-Bar-Fix (mitgenommen, klein & isoliert)**
   - `twoshot_stage` wird bei Abbruch/Fail deterministisch auf `failed` gesetzt, damit `usePipelineProgress` nicht bei 23 % hängen bleibt.
   - Kein Verhalten außerhalb des Fehlerpfads geändert.

6. **Versionierung & Telemetrie**
   - `LIPSYNC_PIPELINE_VERSION` → **231**, `MOTION_GATE_VERSION` → **2**.
   - Log-Felder: `motion_gate`, `retry_count`, `refund_issued` – für spätere Diagnose ohne Frame-Downloads.

## Nicht enthalten (bewusst)
- Kein Anfassen der Multi-Cast-Pipeline.
- Keine Änderungen am v230 Life-Layer (Idle-Motion Damping bleibt).
- Keine neuen UI-Flows – Fehler-Toast + Refund-Notice nutzen bestehende Komponenten.

## Technische Details
- Datei-Scope: `supabase/functions/compose-dialog-segments/*` (Webhook-Handler, Motion-Probe-Utility), `_shared/motion-gate.ts` (neu, gemeinsam mit v113), `usePipelineProgress.ts` (Fail-Flag).
- Idempotenz über `scene_id + attempt` – kein doppelter Refund möglich.
- Frame-Probe läuft serverseitig (ffmpeg schon verfügbar), keine Client-Kosten.

## Erfolgs­kriterium
- Reproduzierte N=1-Szene (`9267e69b`) liefert nach Re-Run entweder sichtbare Lippenbewegung im voiced Window ODER sauberen `failed`-State inkl. Refund. Progress-Bar erreicht in beiden Fällen 100 % bzw. Fail-State.
