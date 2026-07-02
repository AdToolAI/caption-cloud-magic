## Analyse

Das aktuelle Problem kommt nicht vom Slider selbst, sondern von der Architektur:

- Die UI speichert eine Transition zwischen Szene 1 und Szene 2 korrekt.
- Der Resolver legt das Zeitfenster inzwischen zwar an die Schnittkante, aber der Preview-Player mischt drei Zeitmodelle:
  - Video-Clock vom aktiven `<video>`
  - Timeline-Clock für künstlich verlängerte Szenen/Gaps
  - separater Transition-Renderer mit eigenem Ping-Pong-Slot
- Dadurch kann der Player am Cut schon zur nächsten Szene springen, bevor der Transition-Renderer sichtbar beide Layer mischt.
- Zusätzlich ist das aktuell gewählte Modell „Transition startet erst am Cut und hält den letzten Frame der vorherigen Szene“ zwar eine Notlösung, aber nicht das Standardmodell von Top-NLEs.

## Vergleich mit funktionierenden Modellen

Professionelle Editoren wie Premiere, Final Cut, Resolve und CapCut behandeln Übergänge als Effekt auf der Schnittkante:

```text
Standard Cross Dissolve:
Scene A handle  | overlap/crossfade | Scene B handle
            ----|-------------------|----
                cut point in the middle
```

Wichtig dabei:

1. Es gibt eine klare Schnittkante.
2. Der Übergang besitzt ein eigenes Transition-Fenster.
3. Für echte Crossfades braucht man „Handles“: also extra Material nach dem Out-Point von Szene A und vor dem In-Point von Szene B.
4. Wenn keine Handles existieren, machen gute Tools eine verständliche Fallback-Variante:
   - Übergang kürzen,
   - Edge-Transition verwenden,
   - oder einen held frame verwenden, aber sichtbar und kontrolliert.

Unsere Pipeline macht aktuell eine Mischung aus „held outgoing frame“ und „incoming scene starts after cut“. Das kann funktionieren, fühlt sich aber nicht wie ein sauberer NLE-Übergang an und ist anfällig für Sprünge.

## Zielbild

Übergänge sollen sich so verhalten:

```text
Keine Transition:
Scene 1 endet exakt am Cut -> Scene 2 startet exakt am Cut

Mit Transition:
Scene 1 bleibt sichtbar bis Transition-Ende
Scene 2 beginnt sichtbar ab Transition-Start
Beide Layer werden für die eingestellte Dauer gemischt
```

Und wenn genügend Source-Handles vorhanden sind:

```text
Centered NLE mode:
Transition beginnt vor dem Cut und endet nach dem Cut.
Der Cut liegt optisch in der Mitte.
```

Wenn keine Handles vorhanden sind:

```text
Safe Edge mode:
Transition startet am Cut, nutzt den letzten Frame von Szene 1 + laufende Szene 2.
Keine unsichtbare oder zu frühe Transition.
```

## Umsetzungsplan

### 1. Transition-Resolver zu einem echten NLE-Resolver machen

`src/utils/transitionResolver.ts` wird erweitert:

- Transition-Placement wird explizit berechnet:
  - `centered` wenn beide Szenen genug Handles haben.
  - `start-at-cut` als sicherer Fallback.
- Resolver gibt zusätzlich aus:
  - `placement`
  - `hasOutgoingHandle`
  - `hasIncomingHandle`
  - `effectiveDuration`
  - `visualStart`
  - `visualEnd`
  - `cutTime`
- Negative Legacy-Offsets bleiben deaktiviert, damit alte Projekte nicht wieder Früh-Transitions erzeugen.

### 2. Preview-Player: Transition-Branch vor normale Szenenlogik ziehen

`DirectorsCutPreviewPlayer.tsx` wird so umgebaut, dass Transition-Erkennung Priorität bekommt:

- Vor Media/Gaps/normaler Boundary-Seek-Logik prüfen, ob `visualTimeRef.current` in einem Transition-Fenster liegt oder kurz davor ist.
- Während einer Transition darf kein normaler Szenensprung ausgeführt werden.
- Der Player läuft in dieser Phase timeline-led, nicht video-led.
- Nach Transition-Ende gibt es genau einen kontrollierten Handoff auf Szene 2.

### 3. Transition-Renderer als deterministic A/B-Mixer

`useTransitionRenderer.ts` wird vereinfacht:

- Slot A = outgoing layer.
- Slot B = incoming layer.
- Beide werden anhand der Resolver-Daten positioniert.
- Crossfade/Fade/Slide/Wipe/Push/Zoom/Blur bekommen dieselbe Progress-Quelle.
- Kein mehrfaches Seek/Pause/Play pro Frame.
- Standby wird im Preload-Fenster vorbereitet und erst im Transition-Fenster sichtbar.

### 4. Unterschiedliche Source-Arten berücksichtigen

Übergänge müssen funktionieren zwischen:

- Originalvideo -> Originalvideo
- Originalvideo -> hinzugefügtes Video
- hinzugefügtes Video -> Originalvideo
- hinzugefügtes Video -> Bild/Blackscene
- Bild/Blackscene -> Video

Dafür wird die Source-Time-Berechnung zentralisiert, damit nicht jede Branch eigene Logik hat.

### 5. Export-Parität wiederherstellen

`src/remotion/templates/DirectorsCutVideo.tsx` wird an denselben Resolver angepasst:

- Preview und Export verwenden dieselbe Transition-Geometrie.
- Render-Mode rendert die zweite Szene unter der gehaltenen/überlappenden ersten Szene.
- Falls Handles vorhanden sind, wird der Centered-NLE-Modus genutzt.
- Falls keine Handles vorhanden sind, wird derselbe Safe-Edge-Fallback genutzt wie im Preview-Player.

### 6. UI verständlicher machen

`CutPanel.tsx` bekommt eine klare Anzeige:

- „Standard“/„Pro“ Placement-Info je Transition:
  - „Centered“ wenn echte Handles möglich sind.
  - „Am Schnitt“ wenn nur Edge-Fallback möglich ist.
- Der Mini-Balken zeigt nicht nur `Cut | +1.6s`, sondern:

```text
Centered:  -0.8s | CUT | +0.8s
Edge:       CUT | +1.6s
```

Damit der Nutzer versteht, warum ein Übergang so läuft.

### 7. Verifikation

Nach Umsetzung:

- Mit Playwright die vorhandene Szene-1/Szene-2-Konstellation abspielen.
- Prüfen, dass bei 1.6s und 3.0s sichtbares Blending statt Instant-Cut passiert.
- Prüfen, dass die Timeline weiterläuft und nach der Transition auf Szene 2 landet.
- Spot-check Export-Logik auf denselben Resolver, damit Preview und fertiger Render gleich sind.

## Ergebnis

Das macht die Transition-Pipeline robuster und professioneller: nicht mehr „irgendwo ein CSS-Effekt beim Cut“, sondern ein echtes NLE-Modell mit A/B-Layern, klarer Schnittkante, Handle-Erkennung, Fallbacks und Preview/Export-Parität.