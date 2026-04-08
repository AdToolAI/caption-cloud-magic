

## Plan: Export-Dialog mit Format- und Auflösungsauswahl beim Klick auf "Export"

### Problem

Der "Export"-Button in der Header-Leiste ruft direkt `handleExportVideo()` auf und startet sofort das Rendering — ohne dem Nutzer die Möglichkeit zu geben, Seitenverhältnis (16:9, 9:16, 1:1, 4:5) und Auflösung (HD, 4K, 8K) auszuwählen.

### Lösung

Ein modaler Export-Dialog wird angezeigt, wenn der Nutzer auf "Export" klickt. Erst nach Bestätigung im Dialog wird das Rendering gestartet.

### Änderungen

**1. Neue Komponente: `src/components/directors-cut/studio/ExportDialog.tsx`**

- Modal/Dialog mit den Auswahloptionen:
  - **Auflösung**: HD (1080p), 4K (2160p), 8K (4320p)
  - **Seitenverhältnis**: 16:9, 9:16, 1:1, 4:5
  - **Format**: MP4, WebM, MOV
  - **FPS**: 24, 30, 60
- Vorausgefüllt mit den aktuellen `exportSettings`
- "Exportieren"-Button startet das Rendering mit den gewählten Einstellungen

**2. Edit: `src/components/directors-cut/studio/CapCutEditor.tsx`**

- Header-Button "Export" öffnet den Dialog statt direkt `handleExportVideo` aufzurufen
- State `showExportDialog` hinzufügen
- Bei Bestätigung im Dialog: `exportSettings` aktualisieren → dann `handleExportVideo()` aufrufen

**3. Edit: `src/types/directors-cut.ts`**

- `ExportSettings.quality` um `'fhd'` erweitern (Full HD als Standardoption) und `'8k'` beibehalten
- `ExportSettings.aspect_ratio` als Union-Type: `'16:9' | '9:16' | '1:1' | '4:5'`

**4. Edit: `ExportPanel.tsx`**

- Auflösungsoptionen synchron halten: SD entfernen, 8K hinzufügen

### Dateien

| Aktion | Datei | Änderung |
|--------|-------|----------|
| Create | `ExportDialog.tsx` | Modal mit Format/Auflösung/Seitenverhältnis-Auswahl |
| Edit | `CapCutEditor.tsx` | Export-Button öffnet Dialog, Dialog-Bestätigung startet Render |
| Edit | `ExportPanel.tsx` | 8K-Option hinzufügen, SD entfernen |
| Edit | `directors-cut.ts` | Type erweitern um `fhd`, `8k`, strikte Aspect-Ratio-Union |

### Ergebnis

- Klick auf "Export" → Dialog mit Auswahl für Auflösung (HD/4K/8K), Seitenverhältnis (16:9/9:16/1:1/4:5), Format und FPS
- Erst nach Bestätigung wird das Rendering gestartet
- ExportPanel in der Sidebar bleibt synchron

