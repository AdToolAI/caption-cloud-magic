

## Plan: Text-Overlay-Editor im Studio-Sidebar integrieren

### Problem

Der Text-Tab ("Untertitel") in der Studio-Sidebar zeigt nur vorhandene Text-Overlays an und erlaubt deren Entfernung, aber es gibt keine Möglichkeit, **neue Text-Overlays zu erstellen** oder deren Animationen (Glitch, Fade, Bounce, Typewriter etc.) zu konfigurieren. Die `TextOverlayEditor2028`-Komponente existiert bereits, ist aber nur im alten Step-basierten Flow eingebunden.

### Lösung

Die `TextOverlayEditor2028`-Komponente direkt in den Text-Tab der `CapCutSidebar` einbetten. Der bestehende "Text-Overlays Management"-Block (Zeile 739-769) wird durch die vollständige Editor-Komponente ersetzt.

### Änderungen

**Datei: `src/components/directors-cut/studio/CapCutSidebar.tsx`**

1. Import von `TextOverlayEditor2028` hinzufügen
2. Den bestehenden minimalen Overlay-Block (nur Anzeige + Entfernen) durch die `TextOverlayEditor2028`-Komponente ersetzen
3. Die Komponente erhält `overlays`, `onOverlaysChange`, `videoDuration`, `currentTime` und optional `videoUrl` als Props — alle bereits als Sidebar-Props verfügbar
4. Die Props `textOverlays` von `Array<{id, text, startTime, endTime}>` auf den vollen `TextOverlay`-Typ erweitern (ist in `CapCutEditor.tsx` bereits als `TextOverlay[]` vorhanden)

### Dateien

| Aktion | Datei | Änderung |
|--------|-------|----------|
| Edit | `CapCutSidebar.tsx` | `TextOverlayEditor2028` importieren und im Text-Tab einbetten, ersetze den minimalen Overlay-Block |

### Ergebnis

- Nutzer können direkt im Studio neue Text-Overlays erstellen
- Alle 6 Animationen (Fade, Scale, Bounce, Typewriter, Highlight, Glitch) sind auswählbar
- Position, Farbe, Schriftgröße und Timing sind konfigurierbar
- Vorhandene Overlays können bearbeitet werden

