## Status: v193-Pipeline Deployment-Check

Die drei v193-Fixes (Race-Dedup, Batch-Preclip, Listener-Mouth-Matte) sind im Code + Edge Functions + Remotion-Bundle drin. Bevor die nächste 1–4-Sprecher-Szene sauber und schnell durchläuft, sollten wir noch **vier kleine Dinge** verifizieren/erledigen — sonst greifen Teile der Optimierung nicht.

### 1. Feature-Flags in `system_config` prüfen/setzen
Die neuen Codepfade sind flag-gated. Ohne die richtigen Werte fällt die Pipeline still auf den alten v190-Serial-Pfad zurück.

Soll-Zustand:
- `composer.silent_faces_v183` = **false** (Ghost-Faces aus)
- `composer.listener_mouth_matte_v193` = **true** (neuer plate-native Mund-Matte)
- `composer.parallel_sync_so_passes` = **true**
- `composer.sync_so_concurrency_cap` = **4**
- `composer.batch_preclip_render` = **true** (bzw. neuer v193-Block aktiv)

Aktion: Ein `read_query` auf `system_config` und ggf. eine Migration, die fehlende Keys ergänzt / falsche Werte korrigiert.

### 2. Sanity-Check der Deployments
- `compose-dialog-segments` Version enthält `v193_pass_claim_skip_existing` und `v193_batch_preclip_all_start` Log-Marker.
- `render-sync-segments-audio-mux` liest `silent_faces_v183` mit `=== "true"` (nicht `!== "false"`).
- Remotion-Bundle-Version im `system_config.lambda.bundle_serve_url` zeigt auf den frisch deployten Build (mit hard-blocked `globalSilentSlots`).

Aktion: 1 Edge-Function-Log-Grep + 1 DB-Read auf die Bundle-URL. Kein Deploy nötig, nur Verifikation.

### 3. Zombie-Szenen aus letztem 15-Min-Lauf aufräumen
Der letzte Test hatte einen doppelt dispatchen Pass (`b288…` + `6a60…`). Wenn diese Scene noch in `pending`/`rendering_preflight` hängt, blockiert sie ggf. den nächsten Testlauf (Watchdog scannt sie sonst dauerhaft).

Aktion: `lipsync-watchdog` einmal manuell triggern **oder** die eine Test-Szene per `read_query` finden und auf `failed` setzen, damit sie aus dem aktiven Set fällt.

### 4. Ein bewusster End-to-End-Testlauf mit Telemetrie
Erst danach wissen wir, ob das Ziel (~9–10 min für 4 Sprecher, deutlich schneller für 1 Sprecher) erreicht ist.

Zu messen im Log:
- `v193_pass_claim_skip_existing` erscheint = Race-Fix greift
- `v193_batch_preclip_all_start` **einmal** pro Scene, nicht pro Pass = echte Parallelität
- Genau **N** `plan_d_parallel_dispatch_start` Einträge, **kein** doppelter Sync.so-Job pro `pass_idx`
- `v193_mux_timing` < 2 min für ~10s Video
- Player: Nur aktiver Sprecher bewegt den Mund, keine Ghost-Overlays

### Was NICHT mehr gemacht werden muss
- Kein weiterer Codeedit an `compose-dialog-segments`, `render-sync-segments-audio-mux`, `DialogStitchVideo.tsx` nötig.
- Keine Lambda-Bundle-Neu-Deployment nötig, sofern Punkt 2 grün ist.
- Keine Migration für neue Tabellen nötig.

### Reihenfolge im Build-Mode
1. `system_config` lesen → fehlende Flags via Migration setzen (Punkt 1)
2. Edge-Function-Logs + Bundle-URL prüfen (Punkt 2)
3. Zombie-Szene(n) killen (Punkt 3)
4. User macht Testlauf, wir werten Telemetrie aus (Punkt 4)

Danach sollte 1-Sprecher in ~2–3 min und 4-Sprecher in ~9–10 min durchlaufen — ghost-free und ohne „quer durcheinander reden".