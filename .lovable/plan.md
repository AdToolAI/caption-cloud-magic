## Problem
Der aktuelle Fehler ist nicht mehr der alte Insert-/Reihenfolge-Fehler. Die Szene wird vor dem Splitten zwar gespeichert, aber `insertScenesAfter` liest danach noch `project.id` aus einer alten React-Closure. Dadurch glaubt der Callback weiterhin, das Projekt sei nicht gespeichert und wirft: `Project not persisted yet — please save the project first.`

## Plan
1. **Persistierte Projekt-ID stabil verfügbar machen**
   - In `VideoComposerDashboard.tsx` eine `projectRef`/aktuelle Projekt-ID-Referenz ergänzen, die bei jedem Render den neuesten Projektzustand hält.
   - `insertScenesAfter` nicht mehr nur aus der potenziell alten Closure `project.id` lesen lassen, sondern aus der aktuellen Ref.

2. **Nach Auto-Save sofort mit frischer ID arbeiten**
   - Den `onEnsurePersisted`-Callback so anpassen, dass er die frisch gespeicherte `projectId` und Szenen nicht nur via `setProject` setzt, sondern auch synchron in der Ref aktualisiert.
   - Damit kann derselbe Klick-Flow weiterlaufen, ohne auf einen neuen React-Render warten zu müssen.

3. **Refetch nach RPC mit expliziter Projekt-ID absichern**
   - `refetchScenesFromDb` optional eine Projekt-ID entgegennehmen lassen.
   - Nach `replace_composer_scene_with_children` genau die gerade verwendete ID refetchen, statt bei noch alter State-Closure nichts zu tun.

4. **Fehlermeldung verständlicher machen**
   - Falls wirklich keine ID verfügbar ist, die Meldung auf Deutsch und handlungsorientiert ausgeben.
   - Keine HeyGen-/Lip-Sync-Kosten starten, wenn die Szenen-Ersetzung nicht möglich ist.

5. **Verifikation**
   - Codepfad prüfen: `SceneDialogStudio -> onEnsurePersisted -> onInsertScenesAfter -> RPC` verwendet überall dieselbe frische Projekt-ID.
   - Sicherstellen, dass die Fortschrittsanzeige beim Splitten offen bleibt und die alten Szenen nicht wieder einklappen, bevor die Sub-Szenen eingefügt sind.

## Betroffene Dateien
- `src/components/video-composer/VideoComposerDashboard.tsx`
- ggf. minimale Anpassung in `src/components/video-composer/SceneDialogStudio.tsx`, nur falls die generierte Fehlermeldung dort noch präziser abgefangen werden muss.