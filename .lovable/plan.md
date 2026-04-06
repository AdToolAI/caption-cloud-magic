

## Fix: Native Video-Buttons im Vollbild-Player entfernen

### Problem
Im vergrößerten Video-Dialog (`VideoPreviewPlayer`) zeigt der Browser native Buttons für "Bild-in-Bild" und "Download" an. Diese verursachen ein schwarzes Video und sind überflüssig, da der Expand-Button im Carousel bereits ausreicht.

### Lösung

**Datei: `src/components/video/VideoPreviewPlayer.tsx`**

Am `<video>`-Element zwei HTML-Attribute hinzufügen:
- `disablePictureInPicture` — entfernt den Bild-in-Bild-Button
- `controlsList="nodownload nofullscreen noremoteplayback"` — entfernt Download- und weitere überflüssige Buttons

```tsx
<video
  ref={videoRef}
  src={videoUrl}
  controls
  controlsList="nodownload noremoteplayback"
  disablePictureInPicture
  className="w-full h-full"
  autoPlay
/>
```

### Ergebnis
- Nur die Standard-Steuerelemente (Play/Pause, Lautstärke, Fortschritt, Vollbild) bleiben sichtbar
- Kein schwarzes Video mehr durch versehentliches PiP-Aktivieren

