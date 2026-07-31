## Ausgangslage (verifiziert)

Der Diff gegen den Baseline-Commit vom 27.07.2026 (`58060cff`) zeigt für die Lip-Sync-Pipeline:

| Datei | Status |
|---|---|
| `compose-dialog-segments/index.ts` | identisch mit 27.07. |
| `sync-so-webhook`, `compose-clip-webhook` | identisch |
| `lipsync-watchdog`, `report-lipsync-motion-probe` | identisch |
| `_shared/pass-face-preclip.ts`, `_shared/syncso-face-gate.ts` | identisch |
| `render-sync-segments-audio-mux/index.ts` | nur +9 Zeilen Export-Qualität (crf 16, preset medium, jpegQuality 95, Audio 256k); Masken-/Sync-Logik = Juli-Stand |
| `_shared/preclip-geometry.ts` + `.test.ts` | **neu seit v334, von keiner Funktion importiert** |
| `_shared/preclip-trust.ts` + `.test.ts` | **neu seit v336, von keiner Funktion importiert** |

Die Laufzeit ist also bereits auf dem 27.07.-Verhalten. Die vier verwaisten Dateien sind toter Code, der bei künftiger Fehlersuche wieder zu Verwirrung führt.

## Umfang

1. Löschen: `supabase/functions/_shared/preclip-geometry.ts`, `preclip-geometry.test.ts`, `preclip-trust.ts`, `preclip-trust.test.ts`.
2. Repo-weiter Import-Check (`rg "preclip-geometry|preclip-trust"`) zur Bestätigung, dass keine Edge Function oder Frontend-Datei darauf verweist.
3. Verifikations-Diff gegen `58060cff` erneut laufen lassen; erwartetes Ergebnis: als einzige Abweichung der Export-Qualitäts-Block in `render-sync-segments-audio-mux`.
4. Kein Re-Deploy nötig (die betroffenen Funktionen wurden bereits deployed und referenzieren die gelöschten Dateien nicht); optional ein Deploy von `compose-dialog-segments` zur Sicherheit.

## Bewusst nicht angefasst

- Export-Qualitätsprofil im Mux (bessere Bildqualität, unabhängig vom Lip-Sync-Verhalten).
- Autopilot, Branding, Credits, Stripe, Voice Library — alles nach dem 27.07. entstanden und nicht Teil der Pipeline.
