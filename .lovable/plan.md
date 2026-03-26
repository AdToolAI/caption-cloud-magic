

## Fix: Untertitel zu klein im gerenderten Video

### Ursache

Die `fontSize: 48` wird 1:1 als CSS-Pixel im Remotion-Template verwendet — sowohl im Preview als auch im Render. Im Preview-Player wird die 1080x1920 Composition auf eine kleine UI-Fläche herunterskaliert (z.B. ~200px breit), wodurch die 48px-Schrift *relativ* gross aussieht. Im gerenderten Video bei echten 1080x1920 Pixeln sind 48px aber nur ~4.4% der Breite — das ist sehr klein auf einem Handybildschirm.

### Lösung

Die `fontSize` im Remotion-Template (`UniversalVideo.tsx`) proportional zur Composition-Breite skalieren. Referenz: 48px bei 1080px Breite sollte als ~80px gerendert werden. Die user-konfigurierte fontSize wird als Basiswert behandelt und mit einem Skalierungsfaktor multipliziert.

### Änderung

#### `src/remotion/templates/UniversalVideo.tsx`

An allen 3 Stellen wo `subtitleStyle.fontSize` verwendet wird (Zeilen 310, 775, 867):

- Aus `useVideoConfig()` die `width` lesen
- Skalierungsfaktor berechnen: `scaleFactor = width / 1080 * 1.6` (1.6x Vergrösserung für Lesbarkeit)
- `fontSize` ersetzen durch: `(subtitleStyle.fontSize || 48) * scaleFactor`

Beispiel:
```text
1080px Breite: 48 * 1.6 = ~77px (gut lesbar)
1920px Breite: 48 * (1920/1080) * 1.6 = ~137px (proportional)
```

Dies betrifft alle 3 Render-Pfade:
1. `SubtitleOverlay`-Komponente (Zeile 310)
2. Multi-Scene inline Subtitle (Zeile 775)
3. Fallback Single-Background inline Subtitle (Zeile 867)

Der Preview-Player verwendet dieselbe Composition-Breite und denselben Skalierungsfaktor — da Remotion's Player die Composition CSS-skaliert, bleibt die Proportionalität erhalten und Preview und Render sehen identisch aus.

### Dateien
1. `src/remotion/templates/UniversalVideo.tsx` — fontSize-Skalierung an allen 3 Subtitle-Render-Stellen

