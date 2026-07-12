## Ursache (verifiziert im Code)

Der Original-Ton der Szene läuft in Remotion via `<Video>` innerhalb der Composition. In `RemotionPreviewPlayer.tsx` wird nach jedem Klick auf Play und im Autoplay-Effekt aktiv:

```
playerRef.current.unmute();
playerRef.current.setVolume(0);   // ← killt den Original-Ton
```

Zeilen 252/253 (Autoplay), 379/380 (handlePlayClick), 394/395 (toggleMute). Die Zeile `setVolume(0)` stammt aus der Zeit, als Voice-Over und Musik ausschließlich extern über HTMLAudioElements liefen und der Player deshalb stumm bleiben sollte, um Doppelspur zu vermeiden. VO/Musik werden über `diag.silentRender=true` (Zeile 157 im Player, ausgewertet in `UniversalCreatorVideo.tsx` Zeile 2973/3034/3045) bereits aus der Composition entfernt — das `setVolume(0)` mutet damit heute nur noch den `<Video>`-Originalton.

Deshalb:
- Der Player-Slider steht sichtbar auf 100 % (extern gemischt), aber der Remotion-Player intern auf 0 → Original-Video-Ton stumm.
- Der Master-Mute-Button im Preview steuert den externen Mix, nicht den Remotion-Player. Original-Ton bleibt daher stumm, egal was der Nutzer klickt.

## Fix

Datei: `src/components/universal-creator/RemotionPreviewPlayer.tsx`

1. Player-Volume an den externen Mix koppeln, statt ihn auf 0 zu forcieren.
   - Neue kleine Helferfunktion `applyPlayerVolume()` liest den aktuellen `isMuted`/`volume`-State und ruft `playerRef.current.setVolume(isMuted ? 0 : volume)`. Unmute/Mute werden weiterhin über `unmute()` / interne `isMuted`-Steuerung geführt.
2. Ersetzen:
   - `handlePlayClick`: `setVolume(0)` → `applyPlayerVolume()`.
   - Autoplay-`useEffect`: nach `unmute()` → `applyPlayerVolume()` statt implizites Volume 0.
   - `toggleMute` (unmute-Zweig): `setVolume(0)` → `applyPlayerVolume()`; im Mute-Zweig zusätzlich `playerRef.current?.mute()` bzw. `setVolume(0)` — konsistent mit dem externen Mix, damit auch der Original-Ton mit der Master-Mute-Taste stumm geht.
   - `handleVolumeChange`: nach Setzen des externen Volumes zusätzlich `applyPlayerVolume()` aufrufen, damit der Original-Ton dem Master-Slider folgt.
3. Ein `useEffect([isMuted, volume])` synchronisiert das Player-Volume nachträglich, falls React-State-Updates asynchron auflaufen (z. B. beim Laden von neuen `customizations`).

## Warum keine weiteren Änderungen nötig sind

- Der pro-Szene `muted`-Toggle und das globale `useOriginalAudio` werden schon korrekt an `<Video muted volume>` gereicht (`UniversalCreatorVideo.tsx` 1815/1816, 2030/2031). Deren Logik ist nachweislich intakt.
- Voice-Over und Musik laufen weiter extern via `voiceoverAudioRef` / `musicAudioRef`; `diag.silentRender=true` stellt sicher, dass es keine Doppelspur gibt.
- Der finale Export in `render-universal-creator` läuft ohne `previewMode`/`silentRender` — dort ist das Verhalten sowieso vom Player-Volume unabhängig.

## Nicht Teil des Fixes

- Änderungen am Render-Payload oder an `SafeVideo`.
- Änderungen am Per-Szene-Mute-Toggle (funktioniert bereits, sobald der Player-Volume-Bug gefixt ist).
- Änderungen an VO/Musik-Mix (getrennter Kanal, nicht betroffen).
