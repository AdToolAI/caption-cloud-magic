## Problem

Beim Cleanup wurde `supabase/functions/_shared/plate-face-detect.ts` aus einer alten git-Version wiederhergestellt, in der die Funktion `validatePlateFacesGeometry` **nicht** exportiert ist.

Die aktive v166-Pipeline (`compose-dialog-segments`) importiert diese Funktion aber an Zeile 88 und ruft sie an Zeile 1354 auf. Daher schlägt der Worker-Boot fest:

```
worker boot error: The requested module '../_shared/plate-face-detect.ts'
does not provide an export named 'validatePlateFacesGeometry'
```

→ Frontend bekommt: **"Failed to send a request to the Edge Function"**.

Der Rest der v166-Pipeline ist intakt — `compose-video-clips`, `compose-dialog-scene`, Anchor-Build laufen sauber (Logs grün um 22:14).

## Fix (minimal, kein v166-Logikwechsel)

1. `supabase/functions/_shared/plate-face-detect.ts` aus dem letzten bekannt-guten Commit `6149ff131` ("Reverted to commit 26e22b72…") wiederherstellen. Dieser Commit enthält `validatePlateFacesGeometry` mit 3 Vorkommen (Signatur + Implementierung + Re-Export-Check) — das ist exakt die Version, gegen die `compose-dialog-segments` Zeile 1354 geschrieben wurde.
   - Befehl: `git show 6149ff131:supabase/functions/_shared/plate-face-detect.ts > supabase/functions/_shared/plate-face-detect.ts`
2. `grep -n "^export" supabase/functions/_shared/plate-face-detect.ts` muss jetzt `validatePlateFacesGeometry` zeigen.
3. `compose-dialog-segments` neu deployen und Boot-Log prüfen — erwartet: `booted (time: …ms)` ohne SyntaxError.
4. UI-Smoke: Lipsync auf S02 erneut auslösen → kein "Failed to send a request" Toast mehr.

## Was NICHT angefasst wird

- Keine Änderungen an v166-Logik, sync-3, FaceMap, Webhook, Remotion.
- Keine weiteren Restores — alle anderen Cleanup-Restores (face-count, face-crop, twoshot-face-map, dialogPassTransition usw.) bleiben wie sie sind, weil deren Boot-Logs sauber sind.
- Keine DB-Migration nötig.

## Out of scope

- Falls nach dem Restore weitere Imports anderer gelöschter Helpers fehlen, fixe ich diese im selben Stil (per `git show <good-commit>:<path>`), aber nur reaktiv anhand der Edge-Function-Boot-Logs — nicht vorbeugend.