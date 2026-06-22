## Vintage Pass — "1920s Hand-Cranked Camera" Countdown

Geile Idee! Lass uns die Uhr von "moderner Stoppuhr mit Gold-Akzent" zu echtem **Stummfilm-Look** umbauen — wie mit einer hand-gekurbelten 1920er Bell & Howell Kamera gedreht. Das ändert weniger die Struktur als die Textur, die Bewegung und die Farbpalette.

### Was sich ändert

**1. Sepia statt Gold** — Stummfilme waren entweder Schwarz-Weiß mit Sepia-Tonung oder hatten ganze Szenen in einer Farbe eingefärbt (tinting). Die Scheibe wird:
- Warmes **Sepia-Beige** (`#d4b483`, `#a67c52`) statt Bond-Gold
- Hintergrund **gealtertes Cremeweiß** (`#e8dcc4`) statt tiefes Schwarz — also **Negativ umgekehrt**: helle Scheibe, dunkle Zahl, wie ein echter Filmleader vor 1930
- Zahl in **schwerer Antik-Serife** (Playfair bleibt, aber bold + outline) in tiefem Anthrazit `#1a1410`

**2. Hand-Crank Stutter** — 1920er Kameras liefen mit ~16-18 fps statt 24, und der Bediener kurbelte ungleichmäßig. Statt smoother Animationen:
- Sweep-Linie ruckelt in **6 Steps pro Sekunde** statt smooth zu rotieren (`steps(6, end)`)
- Zahlen-Wechsel mit kurzem **Doppel-Bild-Flicker** (3 zoomt aus, kurz beide sichtbar, 2 zoomt rein)
- Die ganze Scheibe macht **alle 0.4s einen 1-2px Mikro-Jitter** (Kamera-Wackeln durch Handkurbel)

**3. Heftiges Film-Flicker** — alte Stummfilme flackern stark wegen ungleichmäßiger Belichtung:
- Helligkeit der Scheibe variiert in 8-12 fps zwischen 85% und 110% (`filter: brightness()` keyframe mit steps)
- Vignette pulsiert mit
- Gelegentliche **Belichtungs-Spitzen** (alle 1.5s ein heller Frame, wie ein verbranntes Einzelbild)

**4. Echte Film-Defekte** statt nur Korn:
- **Vertikale Kratzer** die ein paar Frames lang sichtbar sind und dann woandershin springen (CSS keyframe der die Position steppt)
- **Staub/Haare** — 2-3 kleine schwarze Sprenkel an zufälligen Positionen, die alle paar Frames neu erscheinen
- **Cigarette burns** / Markierungen — die runden braunen Brandflecken oben rechts (klassisches Reel-Change-Zeichen) blitzen 2 Frames bei jedem Zahl-Wechsel auf
- **Splice-Lines** — horizontale weiße Linie die einmal von oben nach unten durchläuft pro Zahl (Klebestelle im Film)

**5. Akademie-Leader 1920er-Style statt moderner Look**:
- Statt 12 Uhren-Ticks → **konzentrische Sektor-Linien** wie auf einem alten SMPTE Universal Leader (1930), aber bewusst noch unregelmäßiger
- Das diagonale ✕ wird **handgezeichnet wirkend** (leicht wackelige Linie, dicker, mit Tinte-Look)
- **Typografische Ornamente** außen herum: kleine Sterne, Punkte, "REEL 1", "PART 1", "PICTURE START" in monospace Caps

**6. Vignette + Linsen-Charakter**:
- Starke **runde Vignette** außen (alte Objektive vignettieren stark)
- Leichte **Linsen-Verzeichnung** an den Rändern (CSS `border-radius` kreisförmig schon da, plus subtiler `filter: blur(0.5px)` an den Außenrändern via Mask)
- **Chromatic Aberration** Andeutung — die Zahl bekommt 0.5px roten Schein links + cyanen rechts (Linsenfehler alter Optiken)

**7. Geschwindigkeit & Sound-Hint**:
- Countdown läuft **leicht ungleichmäßig** — "3" bleibt 1100ms, "2" bleibt 950ms, "1" bleibt 1050ms (wie schlecht gekurbelt)
- Am Ende statt Weiß-Flash → klassischer **Schwarz-Cut mit 2 Frames Weiß-Flicker** dazwischen (Film läuft aus der Schleife)
- Optional: kleine **"PICTURE START"** Lauftext-Markierung die rotiert (out of scope für Audio, aber visuell)

### Choreografie (~3.1s)

| Zeit         | Beat                                                                 |
| ------------ | -------------------------------------------------------------------- |
| 0 – 200ms    | Scheibe blendet ein mit Belichtungs-Flicker (3 schnelle Helligkeits-Pulses) |
| 200 – 1300ms | "3" sichtbar, gestepptes Sweep, Jitter, Flicker durchgehend          |
| 1300ms       | Splice-Linie zuckt durch, "3"→"2" mit Doppel-Frame-Flicker           |
| 1300 – 2250ms| "2" sichtbar (950ms — schneller weil "Kamera überdreht")            |
| 2250ms       | Cigarette burn flackert oben rechts, "2"→"1"                         |
| 2250 – 3300ms| "1" sichtbar mit zunehmendem Flicker (Film läuft aus)                |
| 3300 – 3500ms| Schwarz-Cut mit 2 Frames Weiß-Flicker, Briefing erscheint            |

### Files

- Edit: `src/components/video-composer/stage/StageCountdown.tsx` — komplette Re-Implementation der visuellen Schicht (Struktur bleibt: Scheibe, Zahl, Sweep, Defekte, Flash). Logik (Timer, onComplete) bleibt.
- Edit: `src/components/video-composer/stage/StageWelcomeMoment.tsx` — Hintergrund-Farbe hinter dem Countdown von `#050816` zu tiefem `#0a0805` (warmes Schwarz statt blau-schwarz), damit die Sepia-Scheibe nicht kalt wirkt. Minimal.
- Keine neuen Komponenten, keine Backend-Änderungen.

### Scope

**In scope:** Sepia-Palette, Hand-Crank Stutter (steps), Film-Flicker, Kratzer/Staub/Cigarette burns/Splice lines, ungleichmäßiges Timing, Chromatic Aberration auf der Zahl, runde Vignette, typografische Ornamente.

**Out of scope:**
- Audio (Projektor-Surren, Tick-Geräusche) — separater Pass auf Wunsch
- Komplette Welcome-Sequenz vintage-isieren (du hast den Clapperboard-Look gerade erst freigegeben)
- Frame-Rate-Drop für die ganze Seite

Reiner Frontend-Polish auf einer Komponente. ~0.3 Tag. Soll ich's so umsetzen?
