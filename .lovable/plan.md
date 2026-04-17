

## Befund

Zwei zusammenhängende Probleme, die dieselbe Wurzel haben — die **Single-Video-Architektur** in `ComposerSequencePreview.tsx`:

### 1. Übergänge wirken jetzt hart (Regression)
Die jüngste Version macht beim Szenenwechsel:
- `videoVisible = false` → 80ms opacity-fade-out
- `<video src=...>` wechselt
- Warten auf `canplay`/`loadeddata`
- `videoVisible = true` → 80ms opacity-fade-in

Effekt: Ein **schwarzer Blink** (kein Crossfade) — fühlt sich „hart" an, weil zwischen Slot-A-Frame und neuem Slot-A-Frame nichts liegt außer schwarzer Hintergrund.

### 2. Ein Übergang hängt immer noch
Der 1500ms-Safety-Timer feuert zwar, aber bei genau **einem** Clip (vermutlich dem 4. — auf dem Screenshot mitten in einer Frau am Schreibtisch) ist die Source-URL aus AWS S3 langsam. Die Reveal-Logik feuert, aber das Video hat **noch keinen ersten Frame dekodiert** → User sieht 1.5s lang das Standbild der vorherigen Szene plus dann einen Hard-Cut.

### Wurzel
Beide Probleme verschwinden mit einer **Dual-Slot-Architektur** (Ping-Pong, identisch zu Director's Cut, siehe Memory): Slot B lädt + dekodiert den nächsten Clip im Hintergrund **während Slot A noch spielt**, dann Crossfade über 400ms zwischen beiden `<video>`-Elementen. Kein Schwarz, kein Hänger.

## Plan

### Fix — Ping-Pong Dual-Slot Player für Composer Preview

In `ComposerSequencePreview.tsx`:

**1. Zwei `<video>`-Elemente statt eines**
- `videoARef`, `videoBRef` mit jeweils `preload="auto"`, `playsInline`, `muted`
- State: `activeSlot: 'A' | 'B'` (default `'A'`)
- Helper: `getActive()` / `getStandby()` Refs

**2. Preload-Strategie**
- `useEffect([sceneIdx])`: setze `standby.src = playable[sceneIdx + 1]?.clipUrl` (peek-ahead)
- Standby ist absolut positioniert, `opacity: 0`, **lautlos**, gepausiert auf Frame 0
- Während `playing && !transitioning`: standby ist bereits dekodiert (warm)

**3. Übergang (Crossfade 400ms)**
- Wenn `currentScene` endet (oder `local >= sceneDur`):
  - Standby auf `currentTime = 0` (ist bereits dekodiert → instant)
  - `standby.play()`
  - Crossfade per CSS `transition: opacity 400ms ease-in-out`: active → 0, standby → 1
  - Nach 400ms: `active.pause()`, `setActiveSlot(swap)`, alter Slot wird neuer Standby
  - Preload nächsten Peek-Ahead-Clip in den frisch frei gewordenen Slot

**4. Hänger eliminiert**
- Da Standby vorab dekodiert ist (während Slot A spielt), gibt es **keine Wartezeit** mehr beim Swap
- Falls Standby nach 1.2s noch nicht `readyState >= 2`: trotzdem swappen + 600ms Crossfade statt 400ms (sichtbarer Buffer-Frame ist immer noch besser als Hänger)

**5. Audio (Voiceover)**
- Bleibt am separaten `<audio>`-Element (linear über Timeline), unverändert

**6. Scrub (Slider)**
- Beim manuellen Scrub: setze direkt aktives Slot auf `currentTime = local`, Standby bekommt nächsten Peek-Ahead
- Kein Crossfade beim Scrub (würde verwirren) — nur bei automatischem Szenenwechsel

**7. Bilder (uploadType === 'image')**
- Bleibt bei `<img>`-Rendering, kein Slot-Swap nötig
- Bei Übergang Bild → Video: Crossfade gegen Slot A

**8. CSS-Stack**
```text
<div relative aspect-video>
  <video slot-a absolute inset-0 opacity={a} transition-opacity 400ms />
  <video slot-b absolute inset-0 opacity={b} transition-opacity 400ms />
  <img>...</img> (wenn isImage)
  <PreviewTextOverlayLayer />
  <Subtitles />
</div>
```

## Geänderte Dateien

- `src/components/video-composer/ComposerSequencePreview.tsx` — komplette Re-Implementierung des Player-Cores mit Dual-Slot Ping-Pong (UI/Controls/Subtitles/Overlays bleiben strukturell identisch)

## Verify

1. Preview eines Projekts mit ≥4 Szenen → **alle** Szenenwechsel zeigen sanften 400ms-Crossfade, kein Schwarz
2. Der bisher hängende Übergang läuft ohne Hänger durch (Standby ist warm)
3. Slider-Scrub funktioniert weiterhin sauber (Hard-Cut beim manuellen Scrub ist gewünscht)
4. Voiceover bleibt synchron
5. Bei sehr langsamer Netzwerkverbindung: Übergang läuft trotzdem durch, ggf. minimal längere Crossfade-Dauer

