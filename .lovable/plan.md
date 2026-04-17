

## Befund

Die Per-Szene-Editor-Karte ist **noch im Code** (`VoiceSubtitlesTab.tsx` Z. 654–826) — daher zeigt der Screenshot weiterhin "Szene 1 / Szene 2 / …" mit individuellen Position/Animation/Farbe-Steuerungen.

In den vorherigen Turns wurde zwar:
- Der `TextOverlayEditor2028` **importiert** (Z. 45), aber nie **gerendert**
- `globalTextOverlays` im Datenmodell ergänzt (`AssemblyConfig.globalTextOverlays`)
- `ComposerSequencePreview` so erweitert, dass es `globalTextOverlays` rendert

…aber der **letzte Schritt fehlt**: 
1. Die alte Per-Szene-Karte entfernen
2. Den neuen Editor einbauen
3. Die Overlays an den Preview-Player durchreichen

## Plan

### 1. `VoiceSubtitlesTab.tsx` — Per-Szene-Block ersetzen
- **Z. 654–826 entfernen** (kompletter `<Card>`-Block "Per-Scene Overlays" inkl. Collapsibles, Thumbnails, applyStyleToAll usw.)
- Stattdessen **eine neue Karte** mit:
  ```tsx
  <Card>
    <CardHeader> Type-Icon + "Text-Overlays" + dezenter Hinweis "Spannen über das gesamte Video" </CardHeader>
    <CardContent>
      <TextOverlayEditor2028
        overlays={assemblyConfig.globalTextOverlays ?? []}
        onOverlaysChange={(next) => onUpdateAssembly({ globalTextOverlays: next })}
        videoDuration={totalSceneDuration}
        currentTime={previewCurrentTime}
      />
    </CardContent>
  </Card>
  ```
- Lokaler State `previewCurrentTime` hochreichen via `onTimeUpdate`-Callback vom `ComposerSequencePreview`
- Unbenutzte Imports/Helper aufräumen: `TEXT_POSITIONS`, `TEXT_ANIMATIONS`, `FONT_FAMILIES`, `POSITION_TO_CSS`, `openSceneId`, `updateOverlay`, `applyStyleToAll`, `overlayCount`, `Collapsible*`, `ChevronUp/Down`, `Edit2/Trash2/Check/X` (wo nur für den entfernten Block)

### 2. Overlays an den Preview-Player durchreichen
- In `<ComposerSequencePreview>`-Aufruf (Z. 305–309) ergänzen:
  ```tsx
  globalTextOverlays={assemblyConfig.globalTextOverlays}
  onTimeUpdate={(t) => setPreviewCurrentTime(t)}
  ```

### 3. `generateScriptFromScenes` anpassen
Funktion las bisher aus `scene.textOverlay.text` → wechselt auf `assemblyConfig.globalTextOverlays.map(o => o.text).join('. ')`. (Bleibt nützlich als Voiceover-Skript-Quelle.)

### 4. Mini-Migration beim Mount
Einmaliger `useEffect`: wenn `globalTextOverlays` leer **und** mind. eine Szene noch ein altes `textOverlay.text` hat → konvertiere automatisch (mit `startTime = startOffset(scene)`, `endTime = startOffset + duration`) und schreibe in `assemblyConfig.globalTextOverlays`. Verhindert Datenverlust für alte Drafts.

### 5. Build-Sanitychecks
- `Sparkles`/`Wand2`/`Loader2`-Imports prüfen — bleiben, weil Voiceover-UI sie nutzt
- Kein referenzieller Use von entfernten Helfern → keine TS-Errors mehr

## Geänderte Dateien
- `src/components/video-composer/VoiceSubtitlesTab.tsx` — Per-Szene-Block raus, Director's-Cut-Editor rein, Migration, Time-Sync, Imports aufräumen

## Verify
- Tab "Voiceover & Untertitel": **kein** "Szene 1 / Szene 2 / …" Per-Szene-Editor mehr
- Stattdessen: Der mächtige Director's-Cut-Editor mit Timeline, Templates, Position-Grid, Animations-Live-Preview, Style-Presets
- Text-Overlays erscheinen **nur** im oberen Preview-Player, zeitsynchron zur Wiedergabe
- Ein Overlay kann z.B. von Sek 3 bis Sek 12 laufen, unabhängig von Szenen-Cuts
- Alte Drafts mit Per-Szene-Overlays werden automatisch in globale Overlays migriert

