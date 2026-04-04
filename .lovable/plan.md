

## Plan: Musik-Lautstärkeregler von Step 2 nach Step 4 verschieben

### Was sich ändert

Der Hintergrundmusik-Lautstärkeregler wird aus Step 2 (Content & Voice) entfernt. Er existiert bereits in Step 4 (Audio) über die `AudioAssetSelector`-Komponente — dort bleibt er.

### Änderungen

**1. `ContentVoiceStep.tsx`** — Musik-Slider-Block entfernen
- Die Props `musicVolume`, `onMusicVolumeChange`, `hasMusicSelected` aus dem Interface und der Komponente entfernen
- Den gesamten "Hintergrundmusik"-Card-Block (Zeilen 525–551) entfernen

**2. `UniversalCreator.tsx`** — Props nicht mehr übergeben
- Die drei Props `musicVolume`, `onMusicVolumeChange`, `hasMusicSelected` aus dem `<ContentVoiceStep>`-Aufruf (Zeilen 346–348) entfernen

Der Voiceover-Lautstärkeregler bleibt in Step 2 — nur die Musik wandert raus.

### Betroffene Dateien

1. `src/components/universal-creator/steps/ContentVoiceStep.tsx`
2. `src/pages/UniversalCreator/UniversalCreator.tsx`

