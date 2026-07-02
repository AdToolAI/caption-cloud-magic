## Zwei Bugs identifiziert

**Bug 1 — 1-Frame Blackflash direkt nach dem Übergang**
Am Ende der Transition macht die Handoff-Phase (`useTransitionRenderer.ts` Zeilen 277–330) drei Dinge im selben Frame:
1. Slot A (outgoing) auf `opacity:0` + Reset von `position/inset/zIndex/width/height/objectFit` auf leer.
2. Slot B (incoming, war Standby) auf `opacity:1` + gleicher Style-Reset.
3. `activeSlotRef` flippt auf 'B'.

Das Zurücksetzen von `position:absolute` + `inset:0` löst einen Reflow aus, in dem für einen Frame kein `<video>` das Fenster füllt → der schwarze Hintergrund des Wrappers ist sichtbar. Zusätzlich hat **Slot B kein `onSeeked`-Reveal-Handler** wie Slot A (`DirectorsCutPreviewPlayer.tsx` Zeilen 1667–1674 vs. 1687–1693) — falls ein späterer Seek Slot B minimal repaintet, gibt es keinen Schutz gegen die Frame-0-Painting-Race.

**Bug 2 — Replay zeigt nur Szene 2**
Nach dem Übergang steht `activeSlotRef.current = 'B'`. Beim natürlichen Video-Ende (`handleVideoEnded`, Zeilen 383–413) wird zwar `visualTime=0` gesetzt, aber:
- `activeSlotRef` bleibt auf 'B'
- Slot A/B-Sichtbarkeit wird nicht zurückgesetzt
- `useTransitionRenderer` interner State (`phaseRef`, `lastStandbySeekRef`, `lastActiveTransitionRef`) wird nicht geleert

Beim erneuten Play spielt der Player weiter aus Slot B (Szene-2-Quelle) und die interne Transition-State-Machine hat noch stale Marker → die Szene 1 wird nie wieder gezeigt.

## Fix-Plan

### 1. `src/components/directors-cut/preview/useTransitionRenderer.ts`
- **Style-Reflow vermeiden**: Im Handoff-Branch (Zeilen 285–305) NICHT mehr `position/inset/width/height/objectFit/zIndex` auf `''` setzen. Nur `opacity`, `transform`, `clipPath`, `filter` und `pointerEvents` anfassen. Die Slots bleiben durchgehend `absolute inset-0` (kommt eh aus dem JSX `className`).
- **Overlap-Frame**: Bevor Slot A auf `opacity:0` geht, einen 1-RAF-Frame Delay einbauen (beide Slots kurz sichtbar), damit Slot B garantiert Pixel gerendert hat. Konkret: Handoff in zwei Ticks aufteilen — Tick 1 setzt neuen Slot auf opacity 1, Tick 2 setzt alten auf opacity 0.
- **Reset-API**: Neue Ref `resetTransitionStateRef` exportieren, die von außen aufgerufen werden kann und `phaseRef`, `lastStandbySeekRef`, `lastActiveTransitionRef` cleart.

### 2. `src/components/directors-cut/DirectorsCutPreviewPlayer.tsx`
- **Slot B `onSeeked`-Reveal** (Zeilen 1687–1693): Analoges Handler wie Slot A hinzufügen, das bei `activeSlotRef.current === 'B'` auf `opacity:'1'` flippt.
- **`handleVideoEnded` erweitern** (Zeilen 383–413): Nach dem `visualTime=0` einen `resetToPrimaryVideoSlot(0)` aufrufen und die neue `resetTransitionStateRef` triggern, damit Slot A wieder sichtbar wird und der interne Transition-State clean ist.
- **Loop-Fall absichern**: Falls der Loop-Toggle aktiv ist, gleicher Reset direkt vor dem Auto-Restart.

### Ergebnis
- Kein Blackflash mehr, weil Slot B ununterbrochen fullscreen positioniert bleibt und Slot A erst einen Frame später ausgeblendet wird.
- Replay startet immer sauber mit Slot A + Szene 1, egal wie oft der User "Play" drückt.

Kein Verhalten am Export/Render ändert sich — betroffen ist ausschließlich die Preview-Pipeline.
