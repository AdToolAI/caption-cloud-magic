## Ziel

Der Import-Dialog soll sich **nicht mehr automatisch öffnen**. Stattdessen erscheint oben in der Topbar ein deutlicher **„Video importieren"**-Button (Film-Icon), der den Dialog manuell öffnet. Ohne Video bleibt der Player dunkel/leer und der User kann via Sidebar (Leere Szene / Video hinzufügen) eigene Szenen anlegen.

## Änderungen

### 1. `src/pages/DirectorsCut/DirectorsCut.tsx`
- **Auto-Open entfernen**: Der `useEffect` (Zeilen 864–868), der `setImportDialogOpen(true)` bei fehlendem Video setzt, wird gelöscht. Der Dialog startet geschlossen (`useState(false)` bleibt).
- `onBackToImport` Prop bleibt → triggert Dialog-Öffnung über den neuen Topbar-Button.
- Composer-Handoff (`?source_video=…`) öffnet weiterhin **kein** Dialog (Video kommt direkt rein).

### 2. `src/components/directors-cut/studio/CapCutEditor.tsx` (Topbar, Zeilen ~1599–1625)
- Neuer Button **„Video importieren"** in der linken Header-Sektion, sichtbar **immer wenn `onBackToImport` gesetzt ist**:
  - Gold-akzentuiert (passend zum Bond-2028-Design), Film-Icon (`Film` aus lucide-react), Label `t('dc.importVideo')`.
  - Wenn `videoUrl` leer → Button visuell hervorgehoben (subtiler Gold-Glow + Pulse), damit klar ist „Hier starten".
  - Wenn ein Video geladen ist → Button bleibt sichtbar als „Video wechseln" (gleicher Trigger, Label adaptiv via `videoUrl ? t('dc.changeVideo') : t('dc.importVideo')`).
- Der bestehende „Zurück"-Button entfällt (war nur sinnvoll als Vorstufe-Navigation und wird durch den Importieren-Button ersetzt).

### 3. Leerer Player-Zustand
- `DirectorsCutPreviewPlayer` rendert bei leerer `videoUrl` bereits einen dunklen Container; wir ergänzen einen dezenten Hinweistext zentriert: „Kein Video geladen – importiere ein Video oder erstelle eine leere Szene." (über eine kleine Bedingung im Editor-Bereich rund um den Player).
- Die Sidebar (`CutPanel`) zeigt weiterhin „Leere Szene" und „Video hinzufügen" (Letzteres öffnet ebenfalls den Import-Dialog via `onBackToImport`).

### 4. Übersetzungen
- `src/lib/translations.ts`: Keys ergänzen, falls nicht vorhanden:
  - `dc.importVideo` → DE „Video importieren" / EN „Import video" / ES „Importar vídeo"
  - `dc.changeVideo` → DE „Video wechseln" / EN „Change video" / ES „Cambiar vídeo"

## Geänderte Dateien
- `src/pages/DirectorsCut/DirectorsCut.tsx`
- `src/components/directors-cut/studio/CapCutEditor.tsx`
- `src/lib/translations.ts`

## Nicht im Scope
- Keine Änderung an Szenen-Erkennung, Composer-EDL-Import oder Auto-Analyse-Logik.
- Auto-Analyse läuft weiterhin **nur** wenn der User aktiv ein Video im Dialog auswählt.
