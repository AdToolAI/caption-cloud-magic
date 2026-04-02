
## Empfohlene Lösung

Ja: Es gibt eine saubere und vor allem zuverlässige Lösung. Aber nicht über noch mehr KI-Durchläufe.

Die robuste Lösung ist ein **„Subtitle Safe Zone / Reframe“-Modus**:
Der untere Bereich mit dem eingebrannten Untertitel wird durch **leichtes Zoom + Verschieben nach oben** komplett aus dem sichtbaren Bild geschoben. So ist der Untertitel wirklich weg — deterministisch, sauber und ohne halb sichtbare Reste.

## Warum der aktuelle Ansatz nicht sauber genug ist

Ich habe mir den aktuellen Stand angesehen:

- Die jetzige 3-Pass-KI arbeitet nur als **Erkennungs-/Rekonstruktionsversuch**.
- Genau diese Art von Modell scheitert typischerweise an **stilisierter, transparenter oder kontrastarmer Schrift**.
- Im Frontend wird aktuell nur ein `cleanedVideoUrl` im Editor verwendet. Für ein wirklich sauberes Produkt muss dieselbe Logik **auch im Export** gelten.
- Für Preview und Export gibt es bereits gute Transform-Stellen im Code (`DirectorsCutPreviewPlayer` und `DirectorsCutVideo`), die wir für eine saubere Reframe-Lösung nutzen können.

## Plan

### 1. Neuen Standardmodus für eingebrannte Untertitel einführen
In der Sidebar ersetzen wir den bisherigen Haupt-CTA durch zwei klare Modi:

- **Sauber entfernen (empfohlen)** = Reframe / Zoom & Shift
- **KI-Rekonstruktion (experimentell)** = bisherige Pipeline als Fallback

Dazu kommen einfache Presets:
- Leicht
- Mittel
- Stark

und Feineinstellungen:
- Zoom
- vertikale Verschiebung
- Höhe des unteren „Untertitel-Bands“

### 2. Neue Reframe-Einstellung als echten Editor-State anlegen
Wir führen einen neuen State ein, z. B. `subtitleSafeZone`, und reichen ihn sauber durch:

- `CapCutSidebar`
- `CapCutEditor`
- `DirectorsCut`
- Draft-Persistenz

So bleibt die Einstellung beim Reload erhalten und ist nicht nur ein temporärer Preview-Trick.

### 3. Live-Vorschau wirklich sauber machen
Im `DirectorsCutPreviewPlayer` bekommt das Video einen eigenen Wrapper für:

```text
scale(...) + translateY(...)
```

Wichtig:
- nicht die bestehenden Transitions kaputtmachen
- nicht Ken-Burns überschreiben
- optional einen dezenten Overlay-Hinweis anzeigen, welcher untere Bereich entfernt wird

### 4. Export exakt an die Vorschau koppeln
Die gleiche Einstellung wird in den Render-Flow übernommen:

- `ExportRenderStep`
- Backend-Render-Funktion
- `DirectorsCutVideo` (Remotion)

Damit gilt endlich:
```text
Was im Editor sauber aussieht, wird genauso exportiert.
```

### 5. Bestehende KI-Entfernung nur noch als Fallback behalten
Die aktuelle 3-Pass-Logik kann bleiben, aber nur als **experimentelle Zusatzoption**.
Für „muss komplett verschwinden“ wird der neue Reframe-Modus der Standard.

## Technische Details

Betroffene Dateien:
- `src/components/directors-cut/studio/CapCutSidebar.tsx`
- `src/components/directors-cut/studio/CapCutEditor.tsx`
- `src/components/directors-cut/DirectorsCutPreviewPlayer.tsx`
- `src/pages/DirectorsCut/DirectorsCut.tsx`
- `src/lib/directors-cut-draft.ts`
- `src/components/directors-cut/steps/ExportRenderStep.tsx`
- `src/remotion/templates/DirectorsCutVideo.tsx`
- `supabase/functions/render-directors-cut/index.ts`

Vorgeschlagenes Datenmodell:
```text
subtitleSafeZone = {
  enabled: boolean
  mode: "reframe" | "ai"
  preset: "light" | "medium" | "strong"
  zoom: number
  offsetY: number
  bottomBandPercent: number
}
```

Architektur:
```text
Preview:
video -> safe-zone transform -> ken burns -> transitions -> overlays

Export:
video -> safe-zone transform -> ken burns -> transitions -> overlays
```

Wichtiger Nebeneffekt:
- Keine Datenbank-Migration nötig für die erste Version
- Persistenz kann über den bestehenden Draft + Render-Payload laufen
- Die aktuelle `cleanedVideoUrl`-Logik muss nicht mehr die Hauptlösung sein

Kurz gesagt:
**Ja, es gibt eine saubere Art.**
Aber die saubere, wirklich zuverlässige Art ist hier **kontrolliertes Reframing**, nicht noch mehr OCR-/Inpainting-Durchläufe.
