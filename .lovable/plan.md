## Ursache

Die Remotion-Komposition `UniversalCreatorVideo` legt bei jedem Szenen-Render einen `CategoryContrastOverlay` (Vignette + Dunkel-Gradient) und stellenweise einen `inset boxShadow` über das Video. Das ist Director's-Cut-Terrain, im Universal Creator gibt es dafür keine Regler — der Effekt erscheint also ungewollt und macht Step 4 dunkler als Step 3.

## Fix

Nur Presentation-Layer, eine Datei: `src/remotion/templates/UniversalCreatorVideo.tsx`.

1. **`CategoryContrastOverlay` entfernen** an allen 6 Render-Pfaden (Zeilen 1833, 1855, 1870, 1886, 1903, 1979). Die Komponente selbst bleibt im Code (unbenutzt), damit ein späterer Director's-Cut-Port sie wiederverwenden kann.
2. **Fallback-Vignette-Layer entschärfen** in `GradientFallback` (Zeilen 1490–1504): den `inset boxShadow 0 0 150px 50px rgba(0,0,0,0.4)` und den Bottom-Gradient entfernen. Betrifft nur den Fallback ohne Video-Asset.
3. **Cinematic-Post-Layer prüfen** (`CinematicPostLayer`, `SceneTypeEffects`, `FloatingIcons` — Zeilen 1834–1836): diese sind Szenen-FX (Ken-Burns/Icons), keine Umrandungen. Bleiben unverändert. `disableSceneFx` steht im Universal Creator bereits standardmäßig auf `true` beim Preview-Player-Rendering — falls nicht: zusätzlich hart auf `true` setzen für den Universal-Creator-Pfad.

## Ergebnis

Step 4 zeigt das Video 1:1 wie Step 3, ohne Vignette/Rahmen. Untertitel-Kontrast im Universal Creator wird bereits über den Text-Style (Stroke/Shadow/Box) im `PrecisionSubtitleOverlay` gesichert — kein Contrast-Overlay nötig.

Kein Backend-Change, keine Business-Logik, kein Renderer-Payload-Change (das gerenderte Endergebnis wird gleich clean wie die Vorschau).
