# Plan v293 — Stufe-4-Player-Parität mit Stufe 3

## Ziel
Stufe-4-Preview (Remotion) sichtbar so scharf wie Stufe 3 (natives `<video>`) — bei erhaltener Timeline-, Audio- und Loop-Funktion.

## Befund (bereits geprüft)
`rawMediaMode: true` schaltet in `UniversalCreatorVideo.tsx` bereits ab:
- KenBurns-Wrapper für Image-Szenen (Zeile 1832 → `renderBackgroundContent` statt `KenBurnsImage`)
- Parallax-Wrapper (Zeile 1854 → `renderBackgroundContent` statt `ParallaxBackground`)
- Mood-Filter, Cinematic-Post, Style-Overlays, Scene-FX, Floating-Icons
- Transitions (Zeile 3049) und DrawOn-Effekte (Zeile 3059)
- Image-Saturation/Contrast-Filter im Fallback (Zeile 2102)

Verbleibende Ursachen für weichere Optik:
1. Remotion-Player rendert die Komposition intern auf voller Format-Auflösung (z. B. 1080×1920) und skaliert die Canvas per CSS-Transform auf die Sidebar-Breite (~380 px). Native `<video>` in Stufe 3 skaliert ohne Zwischenebene.
2. Container in `RemotionPreviewPlayer` hat `maxHeight: 65vh` und `width: 100%` — die Layout-Breite kann bei kleinen Sidebars stärker abweichen als in Stufe 3.

## Änderungen

### 1) `src/components/universal-creator/RemotionPreviewPlayer.tsx`
- Container-Style so anpassen, dass er sich exakt wie der Stufe-3-Container verhält:
  - `aspectRatio: width / height` beibehalten
  - `width: '100%'` beibehalten
  - `maxHeight: 65vh` **entfernen** (Stufe 3 hat keine Kappung)
  - `imageRendering: 'auto'` und `transform: 'translateZ(0)'` bleiben (GPU-Kompositing hilft Scharfstellen)
  - Zusätzlich `contain: 'layout paint'` als CSS-Hinweis (verhindert Sub-Pixel-Blur beim Downscale)
- Keine Änderung am Audio-Mix, Autoplay, Loop, Mute-Toggle.

### 2) `src/remotion/templates/UniversalCreatorVideo.tsx`
- Sicherstellen, dass `rawMediaMode` auch für **Video-Szenen** die Ken-Burns/Parallax-Pfade komplett umgeht (bereits über `renderBackgroundContent`-Zweige erledigt) — kein Code-Change, nur Verifikation.
- **Kein** neuer Gate, **kein** Export-Pfad-Change (`rawMediaMode` bleibt für gerenderte MP4s auf `false`).

## Was bewusst NICHT geändert wird
- Kein Rückfall auf natives `<video>` in Stufe 4 — Multi-Szenen-Timeline + Audio-Mix bleiben erhalten.
- Kein Downscale der Composition-Auflösung (würde Export beeinträchtigen, wenn versehentlich weitergereicht).
- Export-Pfad (`render-*`) unverändert — Renders behalten volles Cinematic-Post-Processing.

## Verifikation
- Stufe 3 ↔ Stufe 4: gleiche Container-Höhe in der Sidebar (kein 65vh-Cap-Sprung).
- Video-Szenen in Stufe 4 sichtbar so scharf wie das Raw-Video in Stufe 3.
- Bild-Szenen ohne Zoom-Bewegung (KenBurns aus) — statisches Bild wie in Stufe 3.
- Loop läuft nahtlos, Ton per Mute-Toggle aktivierbar, Timeline zeigt weiterhin alle Szenen.
- Exportierter MP4-Download enthält weiterhin Ken-Burns, Parallax, Grain, Mood-Filter.
