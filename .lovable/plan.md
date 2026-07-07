## Problem

Der Screenshot zeigt drei geisterhafte, halbtransparente Porträts, die dauerhaft über den Plate-Gesichtern kleben. Ursache ist die **v190 Global-Silent-Slots-Schicht**, die ich im letzten Turn durch Setzen von `system_config.composer.silent_faces_v183 = true` scharf gestellt habe.

Im `render-sync-segments-audio-mux` wird pro Sprecher-Slot ein `anchorUrl = brand_characters.portrait_url` an das Remotion-Template durchgereicht. `SilentFaceAnchor` rendert diese URL als `<Img>` in das `preclip_crop`-Rechteck mit einem weichen Radial-Mask darüber.

Das Problem an dieser Quelle:

- `brand_characters.portrait_url` ist ein **generisches Charakter-Porträtfoto** (Kopf + Schultern, teilweise Oberkörper, komplett andere Beleuchtung/Framing/Pose als das Plate).
- Es wird mit `objectFit: cover` in eine Face-Slot-Box gezwängt, die auf dem Plate-Gesicht sitzt.
- Es liegt **szenenweit** (nicht nur während der Silent-Windows) über allen Slots — auch während der eigentliche Speaker gerade spricht, weil die aktive Sync.so-Overlay ihren Slot in ihrem Turn zwar überdeckt, aber die beiden anderen Slots dauerhaft Porträts zeigen.
- Zusätzlich kann `character_id → portrait_url` in Slot 2/3 vertauscht sein, was die vom User genannte Verwechslung von Sprecher 2 und 3 erklärt.

Ergebnis genau wie im Screenshot: drei ghost-artige Avatare, permanent über dem Plate, teils vertauscht.

## Wichtig: Keine Korrektur der Bildquelle — reiner Rollback

v190 wurde als Anti-Idle-Motion-Layer gedacht: geschlossener Mund pro Silent-Slot. Als Bildquelle taugt aber nur ein **plate-eigener** Still (z. B. Freeze des Master-Plates bei Frame 0, gecroppt auf den Slot). Ein externes Porträtfoto passt niemals in Beleuchtung, Framing oder Identität zum Plate. Diese richtige Umsetzung ist ein separates Feature (v190.1), kein Hotfix.

Für den Hotfix ziehen wir die im letzten Turn eingeführte Aktivierung **exakt zurück** und lassen den rohen Plate durchscheinen. Kling wird via v175-Closed-Mouth-Prompt bereits so instruiert, dass Listener-Gesichter überwiegend still bleiben — das ist besser als geisterhafte Porträts.

## Fix

**Einziger Schritt:** Neue Migration schreibt `composer.silent_faces_v183 = false` in `system_config`.

Damit:

- `render-sync-segments-audio-mux` überspringt beim nächsten Render den `globalSilentSlots`-Zweig komplett (`silentFacesV183Enabled` → `false`).
- Der Remotion-Player rendert nur noch die Fanout-Overlays (Sync.so-Outputs pro Turn) über dem rohen Plate.
- Die drei Ghost-Porträts verschwinden sofort.

Keine Code-Änderungen an `render-sync-segments-audio-mux`, `DialogStitchVideo` oder `compose-dialog-segments` — reine Config-Umschaltung, in einer Zeile umkehrbar.

## Was nachher noch zu tun ist (nicht Teil dieses Plans)

- Beobachten, ob mit reinem Plate + v175-Closed-Mouth-Prompt die Restlippen-Bewegung der Nicht-Sprecher akzeptabel gering ist.
- Falls nicht: separater Plan v190.1, der als `anchorUrl` einen aus dem Master-Plate gerenderten Face-Still verwendet (Freeze-Crop statt `brand_characters.portrait_url`) und die Slot-Sichtbarkeit strikt auf die Silent-Windows begrenzt.
- `COMPOSE_DIALOG_SEGMENTS_VERSION` von `"v187"` auf `"v191"` bumpen (log-grep-Kosmetik, kein Verhalten).

## Technische Details

- Migration: `UPDATE public.system_config SET value = 'false'::jsonb WHERE key = 'composer.silent_faces_v183';` (bzw. Upsert mit `INSERT … ON CONFLICT`).
- Betroffene Runtime-Zweige: `render-sync-segments-audio-mux/index.ts` Lines 253–320 (Slot-Bau) und 452–461 (Attach) — beide gated durch `silentFacesV183Enabled`.
- Kein Redeploy nötig, wirkt beim nächsten Scene-Render sofort.
- Rollback dieses Rollbacks: 1 SQL-Zeile.
