
## Fix: Stotterer direkt nach jedem Übergang entfernen

### Wahrscheinliche Root Cause im aktuellen Code

Der Stotterer kommt sehr wahrscheinlich nicht mehr vom eigentlichen Übergang, sondern vom **Handoff direkt danach**:

- In `useTransitionRenderer.ts` wird beim Wechsel `active/preparing → idle` aktuell sofort:
  - `base.currentTime = incoming.currentTime` gesetzt
  - danach das `incoming`-Video sofort pausiert und versteckt
- Dieses `currentTime`-Setzen ist ein **echter Decoder-Seek** auf dem Hauptvideo und erzeugt genau den kurzen Hänger, den man nach jedem Übergang sieht.
- Der aktuelle Cooldown unterdrückt nur den nachfolgenden Boundary-Seek im Player, **nicht** diesen sichtbaren Handoff-Seek.
- Zusätzlich wird das `incoming`-Video aktuell nicht sauber auf dieselbe Playback-Geschwindigkeit wie das Base-Video gespiegelt, wodurch der Handoff unnötig große Zeitdifferenzen bekommen kann.

### Umsetzung

#### 1. Harten Active→Idle-Handoff durch echten `handoff`-State ersetzen
Datei: `src/components/directors-cut/preview/useTransitionRenderer.ts`

Statt nach dem Übergang sofort auf `idle` zu springen:

- neuen Lifecycle verwenden:
  - `idle`
  - `preparing`
  - `active`
  - `handoff`
- Wenn der Übergang endet:
  - `incoming` bleibt **noch sichtbar**
  - `base` wird im Hintergrund auf die Zielposition gebracht
  - erst wenn `base` wieder renderbereit ist, wird sauber auf `base` zurückgeschaltet

So wird der Decoder-Hänger nicht mehr sichtbar.

#### 2. Layer-Swap erst nach echter Readiness
Datei: `src/components/directors-cut/preview/useTransitionRenderer.ts`

Im neuen `handoff`-State:

- `base.currentTime` nur einmal synchronisieren, wenn nötig
- danach auf echte Bereitschaft warten:
  - `base.readyState >= 2`
  - optional zusätzlich `seeked` / sehr kleine Zeitdifferenz als Abschlussbedingung
- erst dann:
  - `incoming.pause()`
  - `incoming.opacity = 0`
  - Styles neutralisieren
  - `phaseRef = 'idle'`

Damit verschwindet das `incoming`-Bild erst dann, wenn `base` wirklich übernehmen kann.

#### 3. Incoming-PlaybackRate an Base/Timeline koppeln
Datei: `src/components/directors-cut/preview/useTransitionRenderer.ts`
Datei: `src/components/directors-cut/DirectorsCutPreviewPlayer.tsx`

Aktuell wird die Wiedergabegeschwindigkeit im Player nur für `videoRef` gepflegt.  
Ich würde eine kleine gemeinsame Rate-/Timing-Quelle bereitstellen und im Renderer während `preparing`, `active` und `handoff` auch auf `incoming.playbackRate` anwenden.

Das reduziert Drift zwischen beiden Video-Layern und minimiert den Korrektur-Seek beim Handoff.

#### 4. Boundary-Advance nach Handoff gezielt nur einmal überspringen
Datei: `src/components/directors-cut/DirectorsCutPreviewPlayer.tsx`

Statt nur mit einem langen pauschalen Cooldown zu arbeiten:

- nach abgeschlossenem Handoff ein kleines, explizites Flag setzen
- den Boundary-Advance genau für den direkt folgenden Zyklus / Szenenwechsel überspringen oder als bereits verarbeitet markieren

So bleibt die Szenenlogik stabil, ohne unnötig lange „blind“ zu unterdrücken.

#### 5. Seek/Reset auf neuen Handoff-State erweitern
Datei: `src/components/directors-cut/DirectorsCutPreviewPlayer.tsx`
Datei: `src/components/directors-cut/preview/useTransitionRenderer.ts`

`handleSeek` und `handleReset` sollen zusätzlich:

- laufenden `handoff` abbrechen
- beide Layer wieder in neutralen Zustand bringen
- Handoff-/Cooldown-/Pending-Refs zurücksetzen

Damit Scrubbing und Wiederholen stabil bleiben.

### Betroffene Dateien

- `src/components/directors-cut/preview/useTransitionRenderer.ts`
- `src/components/directors-cut/DirectorsCutPreviewPlayer.tsx`

### Technische Kurznotiz

```text
Aktuell:
active -> base.currentTime = incoming.currentTime -> incoming sofort weg
=> sichtbarer Seek / Decoder-Hänger

Nach Fix:
active -> handoff
       -> incoming bleibt sichtbar
       -> base wird im Hintergrund synchronisiert
       -> erst bei base-ready wird sauber geswappt
=> kein sichtbarer Stotterer nach dem Übergang
```

### Ergebnis

- Kein kurzer Hänger direkt nach jedem Übergang
- Übergänge bleiben sichtbar und enden deutlich smoother
- Szene 1/2/3 usw. verhalten sich konsistent
- Scrubbing/Reset bleiben stabil
