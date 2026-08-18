# FA-4 Face-Candidate — Deploy Only

Einzelner Production-Deploy von `compose-dialog-segments`. Keine Code-, Doku- oder DB-Änderung, kein Render.

## Schritte

1. Pre-Deploy-Check (read-only): bestätigen, dass in `supabase/functions/compose-dialog-segments/index.ts` exakt
   `COMPOSE_DIALOG_SEGMENTS_VERSION = "v402-fa4-face-candidate-geometry-fix"` steht und der Arbeitsbaum sonst unverändert ist.
2. Deploy ausschließlich der Function `compose-dialog-segments` (kein pauschales/shared Redeploy anderer Functions).
3. Deploy-Evidenz erfassen: Deploy-ID / Function-Version / Timestamp aus der Deploy-Antwort dokumentieren (nur in der Antwort im Chat, keine Dateiänderung).
4. Nachweis, dass keine andere Function deployed wurde: Deploy-Ergebnisliste enthält genau einen Eintrag.
5. Boot-Marker-Nachweis: Function-Logs read-only prüfen auf `BOOT version=v402-fa4-face-candidate-geometry-fix`.
   Falls kein Cold-Start-Log vorliegt: genau eine harmlose Invocation ohne `scene_id`, erwartete Antwort `scene_id_required`. Keine produktive Scene-ID, kein Retry, kein Reset.
6. Erneuter Log-Read zur Bestätigung des Boot-Markers.

## Abschluss

- Alle Belege vorhanden: `FA-4 FACE-CANDIDATE DEPLOY VERIFIED → STOP`
- Sonst: `FA-4 FACE-CANDIDATE DEPLOY BLOCKED — <exakter Grund> → STOP`

Kein Render. Kein FA-5.
