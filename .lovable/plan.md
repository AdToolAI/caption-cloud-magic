## Ziel

Eine einheitliche Lip-Sync-Pipeline für 1, 2, 3, 4 Sprecher: pro Sprecher-Pass immer einen Single-Face-Square-Crop-Preclip via Remotion Lambda rendern und an Sync.so schicken. Sync.so sieht nie wieder eine Multi-Face-Plate, egal wie viele Sprecher in der Szene sind.

## Warum

- v68 hat das 3+-Sprecher-Problem durch Single-Face-Preclips gelöst (`auto_detect:true` ist eindeutig, Sync.so antwortet 200 OK).
- 1- und 2-Sprecher laufen aktuell noch über den alten Full-Plate-Pfad mit `coords-pro` / `active_speaker_detection`. Dieser Pfad hat in der Vergangenheit immer wieder `provider_unknown_error` produziert (v60-Notes, v64-Notes).
- Ein einziger Code-Pfad reduziert Komplexität, eliminiert die N-abhängigen Verzweigungen in `compose-dialog-segments`, `sync-so-webhook` und `render-sync-segments-audio-mux`.

## Plan

1. **`compose-dialog-segments` — Preclip-Gate öffnen**
   - `wantPassPreclip` Bedingung von `speakers.length >= 3` auf `speakers.length >= 1` ändern (d.h. immer, sobald `plateDims` + `pass.coords` + `tightAudioInfo` vorhanden sind).
   - Logging-Tag von `v68_preclip` auf `v69_preclip_unified` umstellen, damit man im Log sieht, dass auch 1/2-Sprecher jetzt diesen Pfad nehmen.
   - Fallback auf Full-Plate-Pfad bleibt erhalten, falls Preclip-Render scheitert (kein Regressionsrisiko).

2. **Sync.so Payload — uniform**
   - Bei Preclip-Pass: `videoInput.url = preclip_url`, `active_speaker_detection = { auto_detect: true }`, keine Master-Space-Coords mehr.
   - `sync_mode=cut_off` bleibt für N=1 (v64), `loop` bleibt für N>=2 (v63). Dieser Schalter ist orthogonal zum Preclip und wird nicht angefasst.
   - Tight-WAV-Slicing (v66/v67) bleibt unverändert.

3. **`render-sync-segments-audio-mux` — Crop-Compositing für alle**
   - Funktioniert bereits für Passes mit `preclip_crop` (v68). Keine Änderung nötig — die N=1/N=2-Passes liefern jetzt auch `preclip_crop`, und der bestehende Code-Pfad rendert Crop-Overlays via `DialogStitchVideo`.
   - Verifizieren, dass die Single-Speaker-Single-Tight-Overlay-Variante (v64) korrekt mit Crop statt FaceMask läuft. Falls nötig, den `useOverlay`-Branch für N=1 auf den Crop-Pfad umlenken.

4. **`sync-so-webhook` — Dispatch-Logik vereinheitlichen**
   - Die Branches für „1 Speaker direkt finalisieren" vs. „N>=2 Audio-Mux dispatchen" konsolidieren: immer den Audio-Mux-Lambda triggern, da jetzt auch N=1 einen Crop-Overlay braucht.
   - Stuck-State-Fix aus v68 (`aliveSiblings` ignoriert erschöpfte `retrying`-Passes) bleibt aktiv.

5. **Frozen Invariants & Doku**
   - Neue Memory `v69-unified-single-face-preclip.md` anlegen.
   - Regel I.1 / I.9 aktualisieren: „Sync.so bekommt NIE eine Multi-Face-Plate — pro Pass immer Single-Face-Preclip, unabhängig von N."
   - `mem://index.md` Eintrag ergänzen.

6. **Validierung**
   - 1-Sprecher Szene: ein Preclip, ein Sync.so-Pass, Crop-Overlay zurück auf Master, Audio aus Master-VO. Log zeigt `v69_preclip_unified`.
   - 2-Sprecher Szene: zwei Preclips, zwei serielle Sync.so-Passes (v60-Serial bleibt), zwei Crop-Overlays.
   - 3/4-Sprecher Szene: wie v68, jetzt nur mit neuem Log-Tag.
   - Cost-Check: Preclip-Lambda kostet ~€0.01/Pass — vernachlässigbar gegenüber Sync.so-Stabilitätsgewinn.

## Tradeoffs

- **Latenz**: +5-15s pro Pass für Preclip-Render. Bei N=1 spürbar (sonst direkter Dispatch). Akzeptabel angesichts der Stabilitätsverbesserung.
- **Kosten**: ~€0.01-0.02 Lambda-Kosten pro Sprecher zusätzlich.
- **Single Point of Failure**: Wenn Preclip-Lambda komplett ausfällt, betrifft das jetzt ALLE Sprecher-Szenen. Mitigation: bestehender Full-Plate-Fallback bleibt für alle N aktiv.

## Out of Scope

- Sync.so Pricing/Refund-Logik
- Tight-WAV-Slicing (v66/v67)
- `sync_mode`-Gating (v63/v64/v66)
- v60 Serial-Chain-Architektur
- UI / Composer-Frontend
