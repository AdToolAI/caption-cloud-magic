## Ziel
Im Universal Content Creator Export-Schritt soll nur noch ein Preview-Player sichtbar sein: der große mittige Player. Dieser darf nicht schwarz bleiben, sondern muss die gleichen Szenen anzeigen, die später gerendert werden.

## Plan
1. **Doppelten Preview-Player entfernen**
   - Im Haupt-Wizard die rechte „Live Preview“-Sidebar im Export-Step ausblenden.
   - Für frühere Steps bleibt die Sidebar unverändert, damit der Workflow nicht kaputtgeht.

2. **Großen Export-Preview-Player stabilisieren**
   - Die Preview im Export-Step bleibt die einzige Quelle für die finale Kontrolle.
   - Die Wrapper-Höhe/Aspect-Ratio so setzen, dass Remotion sicher eine messbare Fläche bekommt und nicht nur einen schwarzen Container rendert.

3. **Scene-Daten für Remotion normalisieren**
   - Aktuelle Universal-Creator-Szenen haben `backgroundAnimation`, Remotion erwartet aber zusätzlich `animation` und bestimmte Scene-Felder.
   - Beim Shared Payload Builder werden Szenen vor Preview und Export in ein Remotion-kompatibles Format gemappt:
     - `backgroundAnimation.type` → `animation` / `kenBurnsDirection`
     - fehlende `type`, `transition.duration`, `textOverlay` sauber defaulten
     - vorhandene Bild-/Video-Backgrounds unverändert übernehmen
   - Dadurch nutzt Preview exakt dieselbe Payload wie der Render.

4. **Playback-Verhalten prüfen**
   - Sicherstellen, dass Play/Pause auf dem großen Player funktioniert.
   - Lautstärke-Änderungen bleiben weiterhin über den externen Audio-Mixer entkoppelt, damit kein Freeze entsteht.

## Technische Dateien
- `src/pages/UniversalCreator/UniversalCreator.tsx`
- `src/lib/universalCreatorRenderPayload.ts`
- optional kleine Anpassung in `src/components/universal-creator/steps/PreviewExportStep.tsx`, falls der Container weiterhin keine stabile Höhe bekommt.