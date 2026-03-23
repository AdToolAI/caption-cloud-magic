

# Plan: 3D-Karussell mit Auto-Play & Scroll-Steuerung

## Probleme
1. **Videos spielen nicht ab** — `onLoadedMetadata` feuert, aber `readyState` ist oft noch 0 bei Cross-Origin. Das `opacity: 0` versteckt das Video und der User sieht nur schwarz/"nicht verfügbar".
2. **Schräglage (rotate)** soll weg → stattdessen echter 3D-Perspektive-Effekt mit `perspective` + `rotateY`.
3. **Scroll-Steuerung** fehlt — Mausrad/Scroll über dem Karussell soll die Slides drehen.

## Lösung (1 Datei: `DashboardVideoCarousel.tsx`)

### 1. Video-Playback endlich zuverlässig machen
- **Opacity-Gate entfernen**: Video sofort mit `opacity: 1` anzeigen (kein Fade-In-Warten auf Events die nie kommen)
- **`preload="auto"`** zurück (metadata reicht nicht für Autoplay bei Cross-Origin)
- **Auto-Play Strategie**: Im `useEffect` bei Slide-Wechsel `video.load()` aufrufen falls `readyState === 0`, dann `play()` mit kurzem Timeout als Fallback
- **Error-Fallback** bleibt bestehen

### 2. Echten 3D-Effekt statt Schräglage
- `rotate()` (2D) komplett entfernen
- Wrapper mit `perspective: 1200px` um das Karussell
- Aktive Karte: `rotateY(0deg)`, `scale(1.05)`, `z-index: 30`
- 1. Nachbar links: `rotateY(25deg)`, rechts: `rotateY(-25deg)`, `scale(0.85)`, `z-index: 20`
- 2. Nachbar: `rotateY(±40deg)`, `scale(0.7)`, `z-index: 10`, `opacity: 0.4`
- `transformStyle: preserve-3d` für echte Tiefenwirkung

### 3. Scroll-to-Rotate (Mausrad-Steuerung)
- `onWheel` Event auf dem Karussell-Container
- `deltaY > 0` → `emblaApi.scrollNext()`, `deltaY < 0` → `emblaApi.scrollPrev()`
- Debounce mit 150ms um schnelles Durchscrollen zu verhindern
- `e.preventDefault()` um Page-Scroll zu blockieren während über dem Karussell

### Betroffene Datei
| Datei | Änderung |
|-------|----------|
| `src/components/dashboard/DashboardVideoCarousel.tsx` | 3D-Effekt, Autoplay-Fix, Scroll-Steuerung |

