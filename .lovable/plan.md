## Zwei verbleibende Bugs

**Bug 1 — Blackflash direkt nach dem Übergang**
Nach dem Handoff läuft im nächsten Idle-Tick von `useTransitionRenderer.ts` folgender Code:
- Zeilen 400–402 (Pre-Seek-Fallback) und 432–434 (steady state) setzen `active.style.position/inset/zIndex = ''`.
- Beim Übergang hatten wir aber `position:absolute; inset:0; zIndex:10/11` inline gesetzt. Das Zurücksetzen auf `''` triggert einen Style-Recomputation-Tick, in dem die JSX-className-Positionierung neu aufgelöst wird. Zusätzlich fällt Slot B von inline `zIndex:11` auf CSS-`zIndex:2` zurück, während Slot A noch inline `zIndex:10` hat, aber erst einen Frame später auf `opacity:0` gedimmt wird → für 1 Frame ist Slot A (leerer Frame) über Slot B sichtbar bzw. der Wrapper-Schwarzhintergrund blitzt durch.

**Bug 2 — Pause reagiert nicht sauber**
- `handlePlayPause`, der externe `isPlaying`-Sync und `stopAllAudio` pausieren nur `getActiveVideo()` — Slot B bleibt weiterlaufen, wenn er im Moment aktiv war/Übergang lief.
- Der Tick-Loop in `useTransitionRenderer.ts` ruft unabhängig vom Play/Pause-State `active.play()` (Zeile 208) und `standby.play()` (Zeile 238) auf. Sobald man während oder direkt nach einer Transition pausiert, spielt der RAF das Video sofort wieder an.

## Fix-Plan

### 1. `src/components/directors-cut/preview/useTransitionRenderer.ts`
- **Layout-Styles einfrieren**: Aus dem Renderer sämtliche inline-Setzungen und Löschungen von `position`, `inset`, `width`, `height`, `objectFit` entfernen (Zeilen 250–254, 268–272, 400–402, 417–421, 432–433). Positionierung kommt komplett aus der JSX-className `absolute inset-0 w-full h-full object-contain`.
- **z-Index sauber managen**: Beim Handoff auch Slot A (jetzt Standby) `zIndex` explizit auf `''` zurücksetzen. Standby-Slot bekommt beim `getTransitionStyles`-Setup keinen zIndex=11 mehr, sondern wir nutzen ausschließlich die klassenbasierten z-Indizes; nur `pointerEvents` und Visual-Effect-Styles bleiben.
- **isPlaying-Gate**: Neue Signatur-Erweiterung `isPlayingRef: React.MutableRefObject<boolean>`. `active.play()` und `standby.play()` nur aufrufen, wenn `isPlayingRef.current === true`. Wenn `false`, aktiv/standby beide `.pause()` innerhalb der Transition-Branch.
- **Standby beim Pausieren stoppen**: Im Idle-Zweig `standby.paused` respektieren; auch wenn eine Transition-Vorbereitung läuft, aber der Player pausiert ist, nie `standby.play()` aufrufen.

### 2. `src/components/directors-cut/DirectorsCutPreviewPlayer.tsx`
- **`isPlayingRef` einführen** und synchron mit dem `isPlaying`-State halten (via `useEffect`); an `useTransitionRenderer` durchreichen.
- **Beide Slots pausieren** in:
  - `handlePlayPause` (Zeile 1454): `videoRefA.current?.pause()` **und** `videoRefB.current?.pause()`.
  - Externer isPlaying-Sync (Zeile 1399): dito.
  - `stopAllAudio` bleibt wie es ist (Audio-only), aber der Aufrufer pausiert zusätzlich beide Video-Slots.
- **Beim Play**: nur `getActiveVideo()?.play()` (unverändert), da Standby-Play nur der Renderer während Transitionen macht — der jetzt selbst am `isPlayingRef` gated ist.

### Ergebnis
- Kein Blackflash mehr, weil kein einziger Layout-Reset mehr auf dem Video-Element passiert; nur `opacity/transform/clipPath/filter/zIndex/pointerEvents` fluktuieren.
- Pause reagiert sofort und bleibt stabil, weil der RAF-Loop nicht mehr gegen die Nutzer-Intention arbeitet und alle beteiligten Video-Elemente wirklich gestoppt werden.

Kein Export-Verhalten ändert sich — nur die Preview-Pipeline.
