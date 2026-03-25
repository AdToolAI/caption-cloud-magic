

## Varianten: Fullscreen-Lightbox, Album-Speichern, Uebernehmen-Logik

### Problem
1. Die Lightbox oeffnet sich beim Klick auf den Expand-Button, aber ein normaler Klick auf das Bild toggelt nur die Selektion — kein Vollbild
2. Kein "In Album speichern"-Button in der Lightbox oder Galerie
3. "Uebernehmen" im ProductInsightBanner aendert nur Kategorie/Licht-Einstellungen, zeigt aber nicht das ausgewaehlte Bild einzeln an

### Aenderungen

#### 1. `src/components/background/SceneGallery.tsx`
- Klick auf Bild oeffnet Lightbox (statt Toggle-Selektion)
- Selektion nur noch per Checkbox/CheckCircle in der Ecke
- Neuer `onSaveToAlbum` Callback-Prop fuer Folder-Button auf jeder Karte (wie bei ImageCard)

#### 2. `src/components/background/ImageLightbox.tsx`
- Download-Button + "In Album speichern"-Button in der Lightbox hinzufuegen
- Props erweitern: `onDownload`, `onSaveToAlbum`

#### 3. `src/pages/BackgroundReplacer.tsx`
- Klick auf Variante oeffnet Lightbox (nicht mehr Toggle)
- "Uebernehmen"-Logik: Neuer State `acceptedScene` — wenn gesetzt, zeigt die Vorschau-Galerie NUR dieses eine Bild gross an (anstatt aller Varianten)
- Button "Alle Varianten anzeigen" um zurueck zur Galerie zu kommen
- SaveToAlbumDialog integrieren (bereits vorhanden als Komponente)
- Dafuer muss das Bild erst in `studio_images` gespeichert werden, dann kann der Album-Dialog geoeffnet werden

#### 4. `src/components/background/ProductInsightBanner.tsx`
- Keine Aenderung noetig — "Uebernehmen" bezieht sich auf KI-Empfehlung (Kategorie/Licht), nicht auf ein Bild

#### 5. Neuer "Uebernehmen"-Button pro Variante
- In SceneGallery oder Lightbox: Button "Uebernehmen" der `onAcceptScene(index)` aufruft
- In BackgroundReplacer: `handleAcceptScene` setzt `acceptedScene = generatedScenes[index]`
- Vorschau-Panel zeigt dann nur dieses Bild gross an mit Export-Optionen

### Dateien
1. `src/components/background/SceneGallery.tsx` — Klick-Logik + Album-Button
2. `src/components/background/ImageLightbox.tsx` — Download + Album + Uebernehmen Buttons
3. `src/pages/BackgroundReplacer.tsx` — acceptedScene State + SaveToAlbumDialog Integration

