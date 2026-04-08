

## Plan: Media-Tab aus Sidebar entfernen — Video-Upload nur im CutPanel

### Problem

Der "Media"-Tab (Ordner-Icon in der Sidebar-Leiste) zeigt eine Video-Upload-Funktion, die dort deplatziert ist. Video-Upload zum Hinzufügen neuer Szenen gehört ausschließlich in den Cut-Tab, wo Szenen verwaltet werden.

### Änderung

**Datei: `src/components/directors-cut/studio/CapCutSidebar.tsx`**

1. **Tab-Trigger entfernen** (Zeile 563-569) — den `<TabsTrigger value="media">` Button aus der TabsList löschen
2. **Tab-Content entfernen** (Zeile 659-729) — den gesamten `<TabsContent value="media">` Block löschen
3. **Grid anpassen** — `grid-cols-8` → `grid-cols-7` (Zeile 541), da ein Tab wegfällt
4. **Video-Upload in CutPanel verschieben** — Im CutPanel einen kleinen "Video als Szene hinzufügen"-Bereich ergänzen mit Dropzone und Dateiauswahl, der `onAddVideoAsScene` nutzt

### Dateien

| Aktion | Datei |
|--------|-------|
| Edit | `CapCutSidebar.tsx` — Media-Tab + Content entfernen, Grid auf 7 Spalten |
| Edit | `CutPanel.tsx` — Video-Upload-Bereich für neue Szenen ergänzen |

