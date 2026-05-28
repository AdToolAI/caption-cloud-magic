## Plan

Ich habe den aktuellen Renderpfad geprüft. Der Render läuft durch, aber der entscheidende Fehler ist sichtbar: Bei deiner Szene wurden zwar eindeutige Gesichtskoordinaten erkannt, der Sync.so-Dispatch läuft trotzdem mit `auto_detect=true`. Dadurch darf Sync.so selbst entscheiden, welches Gesicht spricht – bei Two-Shots ist das genau der Grund für falsche Mundbewegungen.

## Was ich ändere

1. **Deterministische Sprecher-Zuordnung erzwingen**
   - Für Multi-Speaker/Cinematic-Sync wird Sync.so nicht mehr im Auto-Modus gestartet.
   - Wenn `deterministic_coords=true` oder `target_coords` vorhanden sind, wird direkt `auto_detect=false + coordinates + frame_number` genutzt.
   - Der aktuelle Bug ist: `deterministic_coords` wird gespeichert, aber beim Dispatch ignoriert; nur `force_coords` wird ausgewertet.

2. **Frame-/Zeitfenster präzisieren**
   - `frame_number` wird nicht pauschal mit 24fps geschätzt, sondern anhand der Masterclip-FPS bzw. gespeicherter Master-Metadaten berechnet.
   - Damit zeigt Sync.so auf das Gesicht im richtigen Zeitpunkt der Szene, nicht auf ein möglicherweise abweichendes Frame.

3. **FaceMap dauerhaft speichern und validieren**
   - Wenn `compose-dialog-scene` die FaceMap aus dem Anchor neu aufbaut, bleibt sie dauerhaft in `audio_plan.twoshot.faceMap` erhalten.
   - Vor Dispatch wird geprüft: jeder Sprecher muss eine Koordinate haben, und diese Koordinate muss zum richtigen Character gehören.
   - Bei Ambiguität kein “best guess” Auto-Sync mehr, sondern sauberer Stopp mit verständlicher Fehlermeldung.

4. **Stitching näher an Artlist bringen**
   - Der finale Stitch bleibt: Original-Master läuft durch, pro Turn wird nur das lip-synced Fenster darübergelegt, Master-WAV bleibt die einzige Audioquelle.
   - Zusätzlich prüfe ich, dass `render_window` exakt dasselbe Zeitfenster ist wie `segments_secs`, damit Sync-Ausgabe und Overlay bytegenau dieselbe Slice verwenden.

5. **Bestehende falsche Szene reparierbar machen**
   - Nach dem Fix muss die betroffene Szene neu “Clip + Lip-Sync” bzw. Lip-Sync gerendert werden, weil die vorhandenen Sync.so Outputs bereits mit falschem Auto-Detect erzeugt wurden.
   - Ich sorge dafür, dass ein Re-Run nicht wieder dieselben alten `dialog_shots` wiederverwendet.

## Technische Details

- Hauptdateien:
  - `supabase/functions/poll-dialog-shots/index.ts`
  - `supabase/functions/compose-dialog-scene/index.ts`
  - optional `supabase/functions/render-dialog-stitch/index.ts`
- Konkreter Code-Fix im Poller:
  - aktuell: `mode = force_coords ? 'coords' : 'auto'`
  - Ziel: `mode = deterministic_coords || force_coords ? 'coords' : 'auto'`
- Zusätzlich wird die Master-FPS nicht mehr als `ASSUMED_MASTER_FPS = 24` hart angenommen, sondern aus State/Probe abgeleitet oder stabil mit dem tatsächlichen Masterclip synchronisiert.

## Erwartetes Ergebnis

Beim nächsten Render spricht Samuel nur mit Samuels Mund, Matthew nur mit Matthews Mund. Kein Auto-Face-Switching mehr, kein Ghost-Speech durch das falsche Gesicht, und der finale Stitch bleibt Audio-seitig synchron zur Master-WAV.