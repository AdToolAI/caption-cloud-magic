## Status: Ghost-Avatare sind noch AKTIV

Check ergab:
- `system_config.composer.silent_faces_v183 = true` (DB)
- `render-sync-segments-audio-mux` liest Flag weiterhin und übergibt `globalSilentSlots` an Remotion (Zeile 451–472)
- `DialogStitchVideo.tsx` rendert `globalSilentSlots` weiter (Zeile 381–424) — nur die alte `SilentFaceFreeze`-Komponente wurde entfernt, der neue v190-Pfad ist weiter aktiv

Die v192-Performance-Fixes haben den Ghost-Avatar-Layer bewusst nicht angefasst (Rollback-Fähigkeit). Jetzt sauber deaktivieren:

### Schritt 1 — DB kill-switch
Migration: `UPDATE system_config SET value = 'false' WHERE key = 'composer.silent_faces_v183';`

### Schritt 2 — Code-Default umdrehen (`render-sync-segments-audio-mux/index.ts`)
Default für `silentFacesV183Enabled` auf `false` setzen, damit auch bei fehlendem/kaputtem Config-Row keine Ghost-Avatare mehr erscheinen.

### Schritt 3 — Remotion-Safety (`DialogStitchVideo.tsx`)
`globalSilentSlots` im Template hart ignorieren (leeres Array erzwingen), damit bereits gecachte Render-Payloads keine Avatare mehr zeigen können. Schema-Feld bleibt für Backward-Compat bestehen.

### Schritt 4 — Redeploy
`render-sync-segments-audio-mux` + Remotion-Bundle. Bereits fertige MP4s bleiben unverändert; betroffene Szenen müssen neu remuxed werden.

### Rollback
Bei Bedarf: `UPDATE system_config … = 'true'` + Code-Default zurück auf `true` + Template-Guard entfernen.