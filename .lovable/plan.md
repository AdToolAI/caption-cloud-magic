
Ziel: Die Übergänge im Preview wirklich sichtbar machen. Nach dem aktuellen Code sind noch zwei echte Blocker übrig, deshalb reicht der letzte Fix allein nicht.

1. Root Cause, den ich jetzt beheben würde
- In `DirectorsCutPreviewPlayer.tsx` werden beim `handleSeek` und `handleReset` immer noch imperative Resets mit `incoming.style.display = 'none'` gesetzt.
- Im aktuellen `useTransitionRenderer.ts` wird `display` aber gar nicht mehr zurückgesetzt, sondern nur noch `opacity/pointerEvents` gesteuert.
- Ergebnis: Nach dem ersten Seek/Reset bleibt das Incoming-Video hart unsichtbar, selbst wenn der Transition-Renderer später Opacity setzt.

Zusätzlich:
- `useTransitionRenderer.ts` nutzt `frameCacheRef` aktuell gar nicht, obwohl `useFrameCapture` bereits den letzten Frame der ausgehenden Szene cached.
- Dadurch bleibt bei Crossfade/Dissolve das Base-Video ein live laufendes Video statt visuell auf dem letzten Outgoing-Frame “eingefroren”.
- Genau diese Opacity-Übergänge wirken dann fast unsichtbar, weil nicht sauber zwischen “altem Bild” und “neuem Bild” überblendet wird.

2. Konkrete Umsetzung
- `src/components/directors-cut/DirectorsCutPreviewPlayer.tsx`
  - Alle verbliebenen `incoming.style.display = 'none'` Resets in `handleSeek` und `handleReset` entfernen.
  - Stattdessen nur noch `opacity`, `pointerEvents`, `transform`, `clipPath`, `filter`, `position`, `inset`, `zIndex` sauber zurücksetzen.
  - Optional einen kleinen gemeinsamen `resetIncomingLayer()` Helper daraus machen, damit kein inkonsistenter Reset mehr an zwei Stellen lebt.

- `src/components/directors-cut/preview/useTransitionRenderer.ts`
  - Für `crossfade`, `dissolve`, `fade` und ggf. `blur` die cached Outgoing-Frames aus `frameCacheRef` wirklich verwenden.
  - Die vorhandene `canvasRef` gezielt dafür aktivieren:
    - Outgoing-Freeze-Frame auf Canvas zeichnen
    - Canvas nur während diesen opacity-basierten Übergängen sichtbar machen
    - Base-Video darunter visuell neutral halten
    - Incoming-Video wie bisher darüber mit Opacity einblenden
  - Für `slide`, `push`, `wipe`, `zoom` beim aktuellen Dual-Video-CSS-Ansatz bleiben.

3. Warum genau dieser Fix
```text
Aktuell:
Seek/Reset -> incoming.display='none'
Renderer -> setzt nur opacity
=> incoming bleibt unsichtbar

Und bei Crossfade/Dissolve:
base bleibt live-video
statt gefrorenem outgoing-frame
=> Überblendung wirkt nicht sauber / kaum sichtbar
```

4. Betroffene Dateien
- `src/components/directors-cut/DirectorsCutPreviewPlayer.tsx`
- `src/components/directors-cut/preview/useTransitionRenderer.ts`

5. Erwartetes Ergebnis
- Übergänge bleiben auch nach Scrubbing/Seek sichtbar.
- Crossfade und Dissolve sehen endlich wie echte Überblendungen aus.
- Slide/Push/Wipe bleiben stabil.
- Kein “Übergang aktiv in der Timeline, aber im Preview unsichtbar” mehr.

6. Technische Kurznotiz
```text
Visibility ownership muss an genau einer Stelle liegen:
- React/JSX: nur Default-Styles
- Renderer: komplette Laufzeit-Steuerung

Und:
Opacity-Transitions brauchen ein stabiles outgoing visual.
Ein live weiterlaufendes Base-Video ist dafür die falsche Grundlage.
```
