## Ziel

Live-Preview ab Stufe 4 soll sich exakt wie der Player in Stufe 3 verhalten (Autoplay, Loop, `object-contain`, gleiche Bildschärfe), **aber zusätzlich Sound erlauben** (Voiceover, Musik, Original-Audio) über den bestehenden Volume/Mute-Control.

## Analyse

**Stufe 3** rendert roh:
```tsx
<video src={url} className="w-full h-full object-contain" loop muted autoPlay playsInline />
<img  src={url} className="w-full h-full object-contain" />
```
→ automatisch, endlos, `object-contain`, keine Filter, keine Overlays.

**Stufe 4** rendert die Remotion-Komposition `UniversalCreatorVideo` über `RemotionPreviewPlayer`. Aktuell wird `previewMode: true` gesetzt, aber **nicht** `rawMediaMode: true`. In `UniversalCreatorVideo.tsx` hängen alle qualitätsmindernden Layer an `rawMediaMode`:
- `moodFilter` (CSS `filter` für Farb-/Kontrast-LUT)
- `CinematicPostLayer` (Vignette + Film-Grain)
- `styleOverlays` (semi-transparente Farb-/Muster-Layer)
- `SceneTypeEffects` + `FloatingIcons`
- Ken-Burns-/Parallax-Zoom (`animation = rawMediaMode ? 'none' : sceneAnimation`)

Diese Layer machen den sichtbaren Unterschied (weicher, wärmer, körnig). Der Remotion-Player selbst skaliert Bilder korrekt — der Qualitätsverlust kommt aus dem Post-Processing.

Zusätzlich: Player startet nicht automatisch und loopt nicht — Nutzer muss klicken.

**Audio bleibt vollständig erhalten:** `rawMediaMode` betrifft nur visuelle Layer. `SafeVideo` (Original-Ton), `Audio`-Elements für Voiceover/Musik sowie der externe Mix in `RemotionPreviewPlayer` (VO/Music via HTMLAudio, Player-Volume für Scene-Video) laufen unabhängig davon.

## Änderungen

### 1. `src/components/universal-creator/RemotionPreviewPlayer.tsx`
- `inputProps` erweitern: zusätzlich `rawMediaMode: true` neben `previewMode: true`.
- Default-Props: `loopProp = true`, `autoPlay = true`.
- Autoplay-Effekt so anpassen, dass er **stumm startet** (kein `unmute()`, `setIsMuted(false)` entfernen) — genau wie `<video muted autoPlay loop>` in Stufe 3. Der Nutzer kann per bestehendem Mute-Button / Volume-Slider jederzeit Ton aktivieren; der komplette Audio-Mix (VO, Musik, Original-Audio) bleibt voll funktionsfähig.

### 2. Kein Change an Export/Render
- Export-Pfad (`render-*`) übergibt weiterhin `previewMode: false` / `rawMediaMode: false` → gerenderte MP4s behalten Cinematic-Look, Ken-Burns, Grain und Overlays.

### 3. Kein Change am Live-Preview-Panel in `UniversalCreator.tsx`
- Defaults im Player reichen; Aufrufstelle bleibt unverändert.

## Technische Details

- `rawMediaMode` existiert bereits als Zod-Feld (`z.boolean().default(false)`) und ist konsequent als Gate implementiert — keine neuen Flags/Schalter nötig.
- Autoplay-muted ist Browser-konform (Chrome/Safari-Autoplay-Policy).
- Sound-Aktivierung erfolgt über den vorhandenen Mute-Toggle bzw. Play-Button-Handler (`handlePlayClick` ruft bereits `unmute()`), damit der User-Gesture-Requirement erfüllt ist.

## Verifikation

- Stufe 3 ↔ Stufe 4: identischer Bildausschnitt, identische Schärfe, identisches `object-contain`-Verhalten.
- Player läuft ab Stufe 4 automatisch, stumm, in Endlosschleife.
- Klick auf Mute-Toggle / Volume-Slider aktiviert Voiceover + Musik + Original-Ton wie bisher.
- Export-Download enthält weiterhin Cinematic-Post-Processing.
