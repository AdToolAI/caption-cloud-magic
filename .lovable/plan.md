## Ziel
Nach einem Trim/Split/Löschen muss die Preview und der Export exakt die sichtbaren Szenen-Ranges nutzen:
- Szene mit `original_start_time = 2.10s` startet in der Timeline bei `0.00s`, zeigt aber Quelle ab `2.10s`.
- Wenn die erste Szene gelöscht wird, darf das Video nicht wieder bei Quelle `0.00s` anfangen.
- Original-Audio muss dazu synchron bleiben.

## Geplanter Fix

1. **Preview-Player Source-Sync reparieren**
   - Im `DirectorsCutPreviewPlayer` eine zentrale Funktion einbauen: `seekToTimelineTime(timelineTime)`.
   - Diese Funktion setzt Video, Original-Audio, Voiceover und Musik auf die richtige Zeit:
     - Video/Original-Audio: `timelineTime -> original_start_time + Offset`
     - VO/Musik: lineare Timeline-Zeit
   - Beim Play-Klick immer vor `play()` auf die korrekte Source-Zeit seeken.
   - Dadurch startet eine getrimmte erste Szene nicht mehr bei `0s`, sondern bei z. B. `2.10s`.

2. **Szenenänderungen nach Trim/Delete sauber re-synchronisieren**
   - Wenn sich `scenes` ändern, prüft die Preview die aktuelle Timeline-Position neu.
   - Falls die aktive Szene jetzt einen anderen `original_start_time` hat, wird der Media-Clock sofort korrekt gesetzt.
   - Interne Scene-Index-Caches werden zurückgesetzt, damit der Player nicht an einer alten Szene klebt.

3. **Delete/Ripple-Verhalten stabilisieren**
   - In `CapCutEditor` nach dem Löschen einer Szene:
     - Timeline neu lückenlos berechnen wie bisher.
     - Playhead auf eine gültige Position setzen.
     - gelöschte Szene aus der Auswahl entfernen.
   - Wichtig: `original_start_time` / `original_end_time` bleiben beim Recalculating erhalten, damit die nächste Szene weiterhin auf ihren echten Source-Ausschnitt zeigt.

4. **Export-Payload vervollständigen**
   - Aktuell werden beim Export nur `id`, `start_time`, `end_time`, `description` weitergegeben.
   - Ich werde `original_start_time`, `original_end_time`, `sourceMode`, `additionalMedia`, `playbackRate` und relevante Szeneninfos mitgeben.
   - Sonst kann die Preview korrekt sein, aber der Render wieder das Vollvideo nutzen.

5. **Original-Audio-Clip optional an Szenen-EDL angleichen**
   - Der visuelle Source-Sync ist Pflicht; zusätzlich prüfe ich die Original-Audio-Spur.
   - Falls die Timeline-Audio-Waveform/Original-Audio weiterhin Vollvideo-Länge suggeriert, wird sie nach Trim/Delete an die Szene angepasst oder zumindest beim Playback nicht mehr als Wahrheit genutzt.

## Validierung
- Manuell per Browser-Test:
  1. Video importieren.
  2. Szene auf Start `2.10s` trimmen.
  3. Play ab Timeline `0.00s`: Preview muss bei Source `2.10s` starten.
  4. Szene splitten, erste Szene löschen: verbleibende Szene startet bei ihrem korrekten Source-In.
  5. Export starten: Payload enthält Source-In/Out und nutzt nicht wieder das Vollvideo.