

## Plan: Export-Dialog mit Format- und Auflösungsauswahl

### Problem

Der "Export"-Button im Header ruft direkt `handleExportVideo()` auf — ohne Dialog zur Auswahl von Auflösung, Seitenverhältnis, Format und FPS.

### Lösung

1. **Neue Komponente: `src/components/directors-cut/studio/ExportDialog.tsx`**
   - Modal mit Auswahloptionen: Auflösung (HD/4K/8K), Seitenverhältnis (16:9/9:16/1:1/4:5), Format (MP4/WebM/MOV), FPS (24/30/60)
   - Vorausgefüllt mit aktuellen `exportSettings`
   - "Exportieren"-Button übergibt Settings und startet Render

2. **Edit: `src/components/directors-cut/studio/CapCutEditor.tsx`**
   - State `showExportDialog` hinzufügen
   - Header-Button (Zeile 1426) öffnet Dialog statt direkt `handleExportVideo`
   - Bei Bestätigung: `onExportSettingsChange` aufrufen → dann `handleExportVideo()`

3. **Edit: `src/types/directors-cut.ts`**
   - `ExportSettings.quality` um `'fhd'` erweitern
   - `aspect_ratio` als strikte Union: `'16:9' | '9:16' | '1:1' | '4:5'`

4. **Edit: `src/components/directors-cut/studio/sidebar/ExportPanel.tsx`**
   - SD entfernen, 8K hinzufügen, Optionen synchron halten

### Dateien

| Aktion | Datei | Änderung |
|--------|-------|----------|
| Create | `ExportDialog.tsx` | Modal mit Format/Auflösung/Ratio/FPS-Auswahl |
| Edit | `CapCutEditor.tsx` | Export-Button öffnet Dialog |
| Edit | `directors-cut.ts` | Type erweitern (`fhd`, `8k`, strikte Ratio-Union) |
| Edit | `ExportPanel.tsx` | 8K hinzufügen, SD entfernen |

### Ergebnis

Klick auf "Export" → Dialog → Auswahl bestätigen → Rendering startet.

