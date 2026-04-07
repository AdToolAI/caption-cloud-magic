

## Plan: Mediathek-Limits anpassen & KI-Bilder nur in Alben anzeigen

### Überblick
1. Video-Limit von 250 auf **500** erhöhen
2. Neues **Bilder-Limit von 2.500** mit separatem Zähler im Header
3. Gesamtspeicher bleibt bei **10 GB**
4. KI Picture Studio Bilder (`source: 'ai_generator'`) werden aus dem normalen Media-Grid **ausgeblendet** — sie erscheinen **nur** unter dem Tab "Alben" im Unterordner "KI Picture Studio"

### Änderungen

**1. `src/pages/MediaLibrary.tsx`**
- Konstante `MAX_VIDEOS` von 250 auf `500` ändern
- Neue Konstante `MAX_IMAGES = 2500` hinzufügen
- Bildanzahl berechnen: `const imageCount = media.filter(m => m.type === 'image').length`
- `ai_generator`-Bilder aus dem normalen Grid filtern: Im `applyFilters` bei `categoryFilter === "all"` und allen anderen Tabs außer "albums" die Items mit `source === 'ai_generator'` ausschließen
- Im KI-Tab (`categoryFilter === "ai"`) nur noch AI-Videos zeigen, keine `ai_generator`-Bilder
- `imageCount` und `MAX_IMAGES` an den Header übergeben

**2. `src/components/media-library/MediaLibraryHeroHeader.tsx`**
- Neue Props: `imageCount` und `maxImages`
- Dritten Zähler-Ring hinzufügen (neben Videos und Speicher): **Bilder X / 2.500** mit einem Images-Icon
- Speicherlimit-Text aktualisieren: "Maximal 500 Videos oder 2.500 Bilder oder 10 GB"
- Warning/Critical-Logik auf alle drei Limits erweitern

**3. Upload-Validierung in `MediaLibrary.tsx`**
- Bei Upload prüfen: Wenn Bild → `imageCount < MAX_IMAGES`, wenn Video → `videoCount < MAX_VIDEOS`
- Zusätzlich weiterhin das 10 GB Gesamtlimit prüfen

### Ergebnis
- Videos: max 500, Bilder: max 2.500, Speicher: max 10 GB — als separate Limits
- KI-generierte Bilder sind ausschließlich über Mediathek → Alben → KI Picture Studio erreichbar
- Header zeigt drei separate Zähler mit korrekten Dateigrößen

