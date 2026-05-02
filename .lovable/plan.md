## Problem

Im Director's Cut ist beim Vorschau-Playback weder das **Voiceover** noch die **Hintergrundmusik** zu hören – obwohl beide Tracks in der Timeline korrekt liegen. Auch das Original-Video-Audio wird in vielen Fällen nicht ausgegeben.

## Root Cause Analyse

Drei kombinierte Bugs im Audio-Routing:

### 1. Web Audio Graph kappt das Original-Audio
`CapCutPreviewPlayer` ruft `connectToMediaElement(video)` auf. Sobald `createMediaElementSource()` ein `<video>` hängt, fließt der Ton **nur noch** durch den Web-Audio-Graph (Browser-Spec). Das Problem:
- Der `AudioContext` wird in einem `useEffect` (also außerhalb des User-Gestures) erzeugt → bleibt im State `suspended`.
- Es wird zwar versucht `await resumeContext()` beim Play-Klick, aber wenn der Verbindungs-Effect die `<audio>`-Elemente erst danach erzeugt, ist die Reihenfolge kaputt.
- Wenn der User **das Video-Element in `additionalMedia` wechselt** (Scene-Switch), wird der alte `MediaElementSource` weggeworfen, der neue aber nicht zuverlässig neu verbunden (`audioConnectedRef.current` bleibt true).

### 2. `CapCutEditor` legt zusätzlich pro Play-Klick einen orphan AudioContext an
```ts
if (typeof AudioContext !== 'undefined') {
  const ctx = new AudioContext();   // ← orphan
  if (ctx.state === 'suspended') await ctx.resume();
}
```
Das hilft nichts, blockiert aber den Hauptthread und vergiftet das User-Gesture-Token (auf manchen Browsern wird der echte Context dadurch nicht resumed).

### 3. Voiceover/Musik-`<audio>`-Elemente werden außerhalb des User-Gestures erzeugt
`CapCutEditor` erzeugt `new Audio()` lazy in einem `useEffect`, der nach dem React-Re-Render läuft. Beim ersten `play()`-Versuch fehlt das Gesture-Token → Promise wird mit `NotAllowedError` rejected, Fehler nur stillgeschwiegen geloggt (`.catch(err => console.log(...))`).

## Lösung

### Fix 1 — Globaler, einmaliger AudioContext + Unlock im Play-Handler
- Neue Datei `src/lib/directors-cut/audioContext.ts` mit Singleton:
  ```ts
  let ctx: AudioContext | null = null;
  export function getAudioContext() { ... lazy create ... }
  export async function unlockAudio() {
    const c = getAudioContext();
    if (c.state === 'suspended') await c.resume();
  }
  ```
- `useWebAudioEffects` benutzt diesen Singleton statt `new AudioContext()`.
- Aufruf von `unlockAudio()` direkt im Click-Handler von `handlePlayPause` (CapCutEditor + CapCutPreviewPlayer), **bevor** irgendein State-Update passiert.

### Fix 2 — Voiceover/Musik-Audio-Elemente vor-laden
- In `CapCutEditor` `<audio>` Tags **deklarativ** im JSX rendern (hidden), damit React sie beim Mount erzeugt (kein Lazy-Create im Effect):
  ```tsx
  {audioTracks.flatMap(t => t.clips).map(c => (
    <audio key={c.id} ref={el => audioElementsRef.current.set(c.id, el!)} 
           src={c.url} preload="auto" crossOrigin="anonymous" />
  ))}
  ```
- Beim Play-Klick ein `audio.load()` + sofortiges `play(); pause()` für jeden vorhandenen Clip aufrufen, um das Gesture-Token zu „sammeln" — dann läuft das spätere zeitgesteuerte `play()` ohne `NotAllowedError`.

### Fix 3 — Original-Audio per default NICHT durch WebAudio routen
- `CapCutPreviewPlayer` nur dann `connectToMediaElement` aufrufen, wenn **mindestens ein Effekt aktiv ist** (`bass !== 0 || mid !== 0 || treble !== 0 || reverb > 0 || echo > 0 || pitch !== 0`).
- Andernfalls bleibt der Video-Ton normal über das `<video>`-Element direkt am Browser-Output → keine Suspension, keine CORS-Probleme.

### Fix 4 — Cleanup & Re-connect bei Scene-Switch
- `audioConnectedRef` zurücksetzen, sobald der `activeVideoUrl` wechselt, damit beim Wechsel zwischen Original-Video und `additionalMedia` der WebAudio-Graph korrekt neu verbunden wird (falls Effekte aktiv sind).

### Fix 5 — Orphan-Context in `handlePlayPause` entfernen
- Den Block `const ctx = new AudioContext()` ersatzlos streichen — er erzeugt nur Speicherlecks.

### Fix 6 — Fehler sichtbar machen
- `audio.play().catch(...)` → bei `NotAllowedError` einmalig einen Toast "Klicke erneut auf Play, um Audio zu aktivieren" anzeigen, statt nur in die Console zu loggen.

## Betroffene Dateien

```text
src/lib/directors-cut/audioContext.ts          (neu)
src/hooks/useWebAudioEffects.ts                (Singleton verwenden)
src/components/directors-cut/studio/CapCutPreviewPlayer.tsx
src/components/directors-cut/studio/CapCutEditor.tsx
```

## Erwartetes Ergebnis

- **Voiceover** spielt synchron zur Timeline.
- **Hintergrundmusik** spielt parallel und mit Track-Volume-Slider regelbar.
- **Original-Video-Audio** bleibt hörbar (außer wenn Voiceover/Music aktiv sind und Auto-Mute greift).
- Keine `NotAllowedError`-Stille mehr beim ersten Play.
- Audio-Effects (Reverb/Echo/EQ) funktionieren weiterhin, sobald ein Slider bewegt wird.
