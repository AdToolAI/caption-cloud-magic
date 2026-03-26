
## Fix: Content Creator nutzt noch das falsche Remotion-Template

### Ursache
Der letzte Fix fuer `SafeVideo` wurde in `UniversalCreatorVideo.tsx` eingebaut, aber der Universal Content Creator verwendet an den entscheidenden Stellen weiterhin **`UniversalVideo`**:

- `src/components/universal-creator/steps/PreviewExportStep.tsx` sendet beim Rendern `component_name: 'UniversalVideo'`
- `src/pages/UniversalCreator/UniversalCreator.tsx` uebergibt an den Preview-Player `componentName="UniversalVideo"`
- `src/components/universal-creator/RemotionPreviewPlayer.tsx` ignoriert `componentName` aktuell komplett und rendert hart `component={UniversalVideo}`

Die Runtime-Logs bestaetigen das ebenfalls: Der Render lief mit `composition: "UniversalVideo"`. Deshalb greift der neue `SafeVideo`-Schutz aus `UniversalCreatorVideo` ueberhaupt nicht, und der alte Pixabay-Timeout tritt weiter auf.

### Aenderungen

#### 1. `src/components/universal-creator/RemotionPreviewPlayer.tsx`
- `componentName` wirklich verwenden statt immer `UniversalVideo`
- kleine Composition-Registry/Switch einbauen:
  - `UniversalCreatorVideo` → `UniversalCreatorVideo`
  - `UniversalVideo` → `UniversalVideo`
- bei unbekanntem Namen defensiv auf `UniversalCreatorVideo` oder klaren Fallback gehen

#### 2. `src/pages/UniversalCreator/UniversalCreator.tsx`
- Live-Preview des Universal Content Creators von
  - `componentName="UniversalVideo"`
  auf
  - `componentName="UniversalCreatorVideo"`
  umstellen

#### 3. `src/components/universal-creator/steps/PreviewExportStep.tsx`
- Export-Call zu `render-with-remotion` von
  - `component_name: 'UniversalVideo'`
  auf
  - `component_name: 'UniversalCreatorVideo'`
  umstellen

### Warum das den Fehler behebt
Dann nutzen sowohl:
- der Preview Player
- als auch der echte Render auf Lovable Cloud

dieselbe Composition: **`UniversalCreatorVideo`**.

Damit greifen endlich die bereits eingebauten Schutzmechanismen:
- `SafeVideo` fuer Pixabay/Hailuo-Videos
- Gradient-Fallback statt haengendem `delayRender()`
- konsistentes Verhalten zwischen Preview und finalem Render

### Technische Hinweise
- Die vorhandenen Input-Props (`scenes`, `subtitles`, `voiceoverUrl`, `backgroundMusicUrl`, `targetWidth`, `targetHeight`, `fps`) passen bereits zum Creator-Template
- Es ist kein Backend-Schema-Change noetig
- Optional sinnvoll: Logging im Preview/Export klar auf `UniversalCreatorVideo` benennen, damit kuenftige Debugging-Faelle eindeutiger sind

### Dateien
1. `src/components/universal-creator/RemotionPreviewPlayer.tsx`
2. `src/pages/UniversalCreator/UniversalCreator.tsx`
3. `src/components/universal-creator/steps/PreviewExportStep.tsx`
