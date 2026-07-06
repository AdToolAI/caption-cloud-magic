# Warum die Szene aktuell schlecht wirkt

Zwei getrennte Ursachen, beide nachweisbar im aktuellen Code:

## 1) „Alle Sprecher bewegen den Mund"

- `system_config.composer.silent_faces_v183 = false` (per SQL bestätigt).
- Damit rendert `render-sync-segments-audio-mux` **keine** statischen Anchor-Portraits über die stummen Gesichter, und alle Preclips der Fan-Out-Passes zeigen animierte Münder gleichzeitig.
- Der Code für v183 (Silent-Faces-Overlay in `DialogStitchVideo.tsx` + Edge-Function-Populate) ist deployed, aber der Remotion-Bundle wurde noch nicht neu deployed und der Flag steht auf `false`.

## 2) „Video wirkt matschig / niedrige Auflösung"

- Der Fan-Out-Composite läuft auf **Plate-Dimensionen** (`videoDims = plateDims ?? 1280x720`). Ist das Master-Video ein Hailuo-720p-Plate, ist das finale MP4 zwangsläufig 720p und wird im Preview auf ~1500 CSS-px hochskaliert → „matschig".
- Kein CRF-/Bitrate-Regress in Remotion Lambda (Defaults sind CRF 18). Ursache ist die **Quell-Plate-Auflösung**, nicht das Encoding.
- Neben der Plate-Auflösung gibt es zusätzlich einen sichtbaren Qualitätsverlust an Naht-Stellen der Preclip-Crops (Sync.so gibt den Face-Crop 1:1 zurück, aber die Feathered-Ränder werden auf 720p besonders sichtbar).

## Was ich vorschlage

**Kein Rewrite** — zwei kleine, isolierte Änderungen + eine Diagnose-Bestätigung.

### Schritt A — Silent-Faces v183 aktivieren
1. `scripts/deploy-remotion-bundle.sh` ausführen und die neue Bundle-URL in `REMOTION_SERVE_URL` (Edge-Secret) hinterlegen. Grund: v183 verwendet die neue `SilentFaceAnchor`-Komponente im Bundle.
2. `system_config.composer.silent_faces_v183` in DB via Migration auf `true` setzen.
3. Verifikation: eine neue Multi-Speaker-Szene rendern; Edge-Log muss `v183_silent_slots ENABLED speakers=N crops=K anchors=M` zeigen; im finalen MP4 bewegt nur der aktive Speaker den Mund.
4. Rollback (falls Regression): eine SQL-Zeile — Flag auf `false`, kein Code-Revert nötig.

### Schritt B — Plate-Auflösung protokollieren & anheben
1. In `compose-dialog-segments` beim Log-Marker `plateDims source=…` zusätzlich das genutzte Provider-Modell (Hailuo/Kling/Vidu) mit-loggen, damit wir für die konkrete matschige Szene den Provider bestätigen können.
2. Wenn Ursache bestätigt Hailuo-720p ist: im Composer-Master-Clip-Rendering (nicht in dieser PR) den Default auf **1080p-Variante** heben oder pro Szene per Flag anheben. Reine Provider-Config-Änderung, kein neuer Code-Pfad in der Lipsync-Pipeline. **Diesen Teil erst nach Bestätigung durch Log der aktuell schlechten Szene umsetzen** — daher hier nur die Log-Erweiterung planen.
3. Optional (kleine Verbesserung, unabhängig): Feather-Radius der Silent- und Active-Face-Overlays in `DialogStitchVideo.tsx` von aktuell radial-hart auf einen weicheren Falloff (z. B. `radial-gradient(… 65%, transparent 100%)`) — reduziert sichtbare Naht auf 720p um ~50 %, ohne die Pipeline zu ändern.

### Schritt C — Forensik-Persistenz (aus letzter Runde, weiter offen)
`retry_history[]` je Pass-Slot in `dialog_shots` schreiben (max. 8 FIFO-Einträge, geschrieben von `sync-so-webhook` bei Redispatch/Retry-Ladder-Wechsel). Keine Verhaltensänderung, nur Debug-Persistenz, damit wir künftige „warum 15 min" Fälle rekonstruieren können.

## Nicht angefasst
- Sync.so-Payload-Contract, Retry-Ladder, Pricing, Refund-Logik.
- v166 Anchor-Identity-Bridge, v168 Per-Pass-Locks, v169-A Stale-Reconcile.
- v129.x Doc-Strict / sync-3 Forbidden-Fields.
- `finalize-dialog-scene` Concat, pg_cron Watchdogs.
- Hailuo Master-Plate Dauer / Anchor-Frame-Logik.

## Erfolgskriterien
- **Neuer 4-Sprecher-Run**: im finalen MP4 bewegt nur der aktuell sprechende Speaker den Mund; Edge-Log zeigt `v183_silent_slots ENABLED`.
- Preview-Bildqualität: `plateDims`-Log zeigt Provider + Auflösung; wenn 720p, entscheiden wir in einem Folgeschritt über 1080p-Provider-Default.
- Wallclock unverändert (v183 ist reine Overlay-Änderung, keine zusätzlichen Provider-Calls).

## Reihenfolge
Schritt A zuerst (löst sichtbar „alle reden") → dann eine Test-Szene rendern → mit dem Log aus Schritt B entscheiden, ob Provider-Auflösung angehoben wird → Schritt C parallel als reine DB/Log-Erweiterung.
