
Problemursache im aktuellen Code:
- In Step 11 wird zwar `subtitleSafeZone` an `ExportRenderStep` übergeben, aber die dortige Vorschau nutzt es nicht. `DirectorsCutPreviewPlayer` bekommt in `ExportRenderStep.tsx` aktuell kein `subtitleSafeZone`-Prop.
- Zusätzlich rendert/exportiert Step 11 noch mit `selectedVideo.url`. Das im CapCut-Editor erzeugte `cleanedVideoUrl` wird in `DirectorsCut.tsx` nicht als State gehalten, sondern nur punktuell in den Draft geschrieben. Dadurch sehen Preview und Render in Step 11 weiter das Originalvideo.

Geplanter Fix:
1. `DirectorsCut.tsx` um echtes `cleanedVideoUrl`-State erweitern
- Neues `const [cleanedVideoUrl, setCleanedVideoUrl] = useState<string | undefined>()`
- Draft-Load: `draft.cleanedVideoUrl` wiederherstellen
- Auto-Save: `cleanedVideoUrl` in den normalen Draft-Sync aufnehmen
- `CapCutEditor`-Callback `onCleanedVideoUrlChange` auf `setCleanedVideoUrl(url || undefined)` umstellen statt nur einmal `saveDraft(...)` aufzurufen

2. Step 11 konsequent auf die aktive Videoquelle umstellen
- In `DirectorsCut.tsx` für `ExportRenderStep` nicht mehr `selectedVideo?.url`, sondern `cleanedVideoUrl || selectedVideo?.url` übergeben
- So nutzt sowohl die Step-11-Vorschau als auch der Render-Request dieselbe Quelle wie im Editor

3. Step-11-Vorschau mit Safe Zone angleichen
- In `src/components/directors-cut/steps/ExportRenderStep.tsx` `subtitleSafeZone={subtitleSafeZone}` an `DirectorsCutPreviewPlayer` weiterreichen
- Damit sieht die Vorschau in Export-Stufe 11 endlich exakt denselben Crop/Reframe wie im CapCut-Editor

4. Export-Payload unverändert weiter nutzen, aber mit korrekter Quelle
- Der Payload enthält `subtitle_safe_zone` bereits korrekt
- Nach Fix von Schritt 2 wird zusätzlich auch `source_video_url` korrekt auf das bereinigte Video zeigen, falls vorhanden

5. Erwartetes Ergebnis nach dem Fix
- In Step 11 verschwinden die Untertitel in der Vorschau genauso wie im Editor
- Der Export rendert mit derselben Videoquelle und denselben Safe-Zone-Einstellungen
- Es gibt keine Diskrepanz mehr zwischen CapCut-Editor, Export-Vorschau und finalem Render

Betroffene Dateien:
- `src/pages/DirectorsCut/DirectorsCut.tsx`
- `src/components/directors-cut/steps/ExportRenderStep.tsx`

Technische Kurznotiz:
```text
CapCut Editor:
cleanedVideoUrl || videoUrl
        ↓
DirectorsCut state:
cleanedVideoUrl speichern + wiederherstellen
        ↓
Step 11:
videoUrl = cleanedVideoUrl || selectedVideo.url
subtitleSafeZone an Preview weitergeben
        ↓
render-directors-cut:
source_video_url + subtitle_safe_zone bereits vorhanden
```
