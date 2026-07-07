## Diagnose

- Die Ghost-Face-Overlays sind wirklich aus: `composer.silent_faces_v183=false`, Mux-Log zeigt `v183_silent_slots DISABLED`, und das Remotion-Template ignoriert `globalSilentSlots`.
- Das neue Problem „Leute reden quer durcheinander“ ist deshalb sehr wahrscheinlich der rohe Master-Plate unter den aktiven Sync.so-Crops: außerhalb des aktiven Sprecher-Crops laufen die ungesyncten Mundbewegungen aller anderen Figuren weiter. Genau das hatte v164/v183 maskiert; nach dem Abschalten sieht man den ursprünglichen Plate-Talk wieder.
- Die aktuelle Laufzeit ist nicht v169-tempo: im letzten Job dauerte es ca. 11:23 ab erstem Dialog-Dispatch bis finalem Clip, plus vorgelagerte Plate/TTS-Zeit kann subjektiv ~15 Minuten ergeben.
- Größte Zeitblöcke im letzten Job:
  - pro Pass ca. 65–125s Preclip/Preflight vor Sync.so-Dispatch
  - Sync.so pro Pass ca. 77–115s
  - finaler Remotion-Mux ca. 4 Minuten
- Auffällig: Pass 3 wurde doppelt dispatched (`b288...` und `6a60...`). Das ist ein Race zwischen Fanout/Webhook-Advance und kostet Zeit, Credits und kann falsche/stale Outputs in den finalen Mux bringen.

## Warum v169 einfacher/schneller wirkte

v169 war wesentlich schlanker: weniger Listener-Mute-/Ghost-Layer, weniger harte Gates, weniger Retry-/NOOP-/BBox-Forensik und weniger Race-Schutz drumherum. Danach kamen viele Stabilitätsfixes gegen falsche Sprecher, Noops, Edge-Faces, Ghost-Mouths und Provider-Fehler dazu. Einige davon sind sinnvoll, aber aktuell haben wir zwei Regressionen:

1. Der „Nicht-Sprecher-Mund ruhigstellen“-Fix wurde wegen Ghost-Faces deaktiviert, ohne einen sauberen Ersatz einzubauen.
2. Der Parallel-Fanout ist zwar eingeschaltet, aber Preclip-Preflight + Advance-Races verhindern wieder echte One-Wave-Performance.

## Umsetzungsplan

### 1. Race-Fix: ein Pass darf nie doppelt dispatchen
- In `compose-dialog-segments` vor jedem Sync.so-Dispatch den aktuellen Pass aus der DB frisch lesen.
- Wenn der Pass bereits `rendering` mit `job_id` oder `done` ist, sofort `202` zurückgeben statt erneut zu dispatchen.
- Für Advance/Webhook-Fanout den Pass-Zustand atomar auf `rendering_preflight` claimen, bevor Preclip/Gate startet.
- Ziel: kein zweiter Sync.so-Job für denselben `pass_idx`; kein stale Output im Mux.

### 2. Echte Parallelität zurückholen
- Fanout nicht erst nach langem Pass-0-Preflight wirksam machen: Skeletons und Preclip-Tasks müssen vor bzw. parallel zum ersten Sync.so-Dispatch gestartet werden.
- Batch-Preclip für alle Sprecher beim ersten Dispatch aktivieren/vereinheitlichen, nicht nur für Passes jenseits des Concurrency-Caps.
- Bestehende `composer.batch_preclip_render=true`-Flag wirklich im Codepfad nutzen oder die tote/alte Flag entfernen und durch einen klaren `v193_batch_preclip_all_passes`-Block ersetzen.
- Ziel: bei 4 Sprechern alle Preclips parallel, danach alle Sync.so-Jobs in einer Welle bis Cap 4.

### 3. „Quer durcheinander reden“ ohne Ghost-Avatare lösen
- Kein Portrait-/Avatar-Overlay zurückbringen.
- Stattdessen Listener-Mute als kleiner, plate-eigener Mouth-Matte:
  - pro nicht aktivem Sprecher nur eine kleine Mund-/Kiefer-Region maskieren, nicht das ganze Gesicht
  - Quelle ist ein frame-/plate-basierter neutraler Crop oder ein inpainted closed-mouth patch aus derselben Szene, nicht das Avatar-Portrait
  - der aktive Sprecher-Crop liegt weiterhin darüber
- Feature-flagged ausrollen, z. B. `composer.listener_mouth_matte_v193`, default zunächst aus oder nur für neue Remux-Tests.
- Ziel: Nicht-Sprecher bewegen den Mund nicht, ohne sichtbare Ghost-Faces/Avatar-Köpfe über dem Plate.

### 4. Mux-Zeit senken
- Mux-Render-Parameter prüfen: aktuell kostet der finale Dialog-Stitch ca. 4 Minuten für 8.7s Video.
- Für `DialogStitchVideo` eine schnellere Lambda-Konfiguration verwenden: mehr Frames pro Lambda / scene-aligned chunks / unnötige Full-HD Re-encodes vermeiden, solange Qualität stabil bleibt.
- Idempotenten `force_remux` beibehalten, damit betroffene Szenen nach Fix ohne vollständige Neugenerierung neu gestitcht werden können.

### 5. Forensik/Validierung
- Neue Logmarker:
  - `v193_pass_claim_skip_existing`
  - `v193_batch_preclip_all_start/done`
  - `v193_listener_matte_slots`
  - `v193_mux_timing`
- Nach Implementierung einen neuen 3–4-Sprecher-Test auswerten:
  - keine doppelten `DISPATCHED` rows pro `pass_idx`
  - alle Passes starten innerhalb kurzer Zeit
  - finale Szene: nur aktiver Sprecher bewegt den Mund
  - Zielzeit: wieder näher an ~9–10 Minuten für 4 Sprecher, abhängig von Sync.so/Lambda-Queue

## Erwartetes Ergebnis

- Ghost-Faces bleiben weg.
- Nicht-Sprecher reden nicht mehr sichtbar mit.
- Doppelte Sync.so-Pass-Dispatches werden verhindert.
- 4-Sprecher-Laufzeit sollte wieder deutlich unter die aktuellen 11–15 Minuten fallen.