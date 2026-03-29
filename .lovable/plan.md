

## Fix: Director's Cut Transitions — Scene-3-Dopplung und Slide-Effekte

### Problem-Analyse

Zwei konkrete Bugs identifiziert:

**Bug 1: Szene 3 wird kurz doppelt gezeigt**
In `DirectorsCutPreviewPlayer.tsx` Zeile 446-451: Während einer aktiven Transition wird `lastSceneIndexRef` NICHT aktualisiert (extended-tolerance match). Wenn die Transition endet und der Video-Decoder bereits in der nächsten Szene ist, erkennt die Szene-Wechsel-Logik einen "neuen" Szenenwechsel und versucht, zur nächsten Szene zu seeken — obwohl das Video dort schon ist. Das erzeugt einen kurzen Flash/Rücksprung.

**Bug 2: Slide-Effekte kaputt**
Das `<canvas>` Element hat `object-contain` als CSS-Klasse (Zeile 790), aber Canvas-Elemente unterstützen `object-fit` NICHT. Das `<video>` Element verwendet `object-contain` korrekt (Zeile 779), aber der Canvas zeichnet das Bild über die volle Canvas-Breite/-Höhe — ohne das Seitenverhältnis des Videos zu berücksichtigen. Bei Videos mit anderem Seitenverhältnis als dem Container (z.B. Portrait-Video in Landscape-Container) stimmt die Canvas-Zeichnung nicht mit dem Video überein. Slide/Push/Wipe-Effekte erscheinen dann verschoben oder gar nicht sichtbar, weil sie außerhalb des sichtbaren Bereichs gezeichnet werden.

### Umsetzungsplan

**1. Scene-Tracking während Transitions fixen** (`DirectorsCutPreviewPlayer.tsx`)
- Wenn eine Transition aktiv ist UND `sceneInfo.index` dem `incomingSceneId` der aktiven Transition entspricht → `lastSceneIndexRef` sofort auf den neuen Index setzen
- So weiß die Boundary-Logik nach Ende der Transition, dass wir bereits in der richtigen Szene sind, und der Doppel-Seek entfällt

**2. Canvas-Rendering an Video-Seitenverhältnis anpassen** (`useTransitionRenderer.ts`)
- Vor dem Zeichnen das tatsächliche Video-Seitenverhältnis berechnen (`video.videoWidth / video.videoHeight`)
- Die Zeichenfläche (drawImage-Koordinaten) so berechnen, dass sie dem `object-contain`-Verhalten des Video-Elements entspricht (Letterbox/Pillarbox)
- Alle `drawImage`-Aufrufe in `drawTransitionComposite` mit den korrekten Offset-/Größenwerten versehen
- Alternativ: Canvas-Größe auf die tatsächliche Video-Darstellungsfläche beschränken und CSS-Positionierung anpassen

**3. Transition-Ende sauber handhaben** (`DirectorsCutPreviewPlayer.tsx`)
- Nach Ende einer Transition (Frame N wo `cachedActiveTrans` erstmals null ist, nachdem es zuvor truthy war): Den `lastSceneIndexRef` auf den Index der aktuellen Szene setzen, bevor die Boundary-Crossing-Logik läuft
- Das verhindert den falschen "Sprung" zur selben Szene

### Betroffene Dateien
- `src/components/directors-cut/DirectorsCutPreviewPlayer.tsx` — Scene-tracking + Transition-Ende-Handling
- `src/components/directors-cut/preview/useTransitionRenderer.ts` — Canvas Aspect-Ratio-korrektes Zeichnen

### Ergebnis
- Szene 3 wird nicht mehr doppelt angezeigt
- Slide/Push/Wipe-Effekte funktionieren wieder korrekt, auch bei Videos mit anderem Seitenverhältnis

