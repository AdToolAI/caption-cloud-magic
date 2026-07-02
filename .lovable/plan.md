# Fix: Flash nach dem Übergang (Media → Media)

## Ursache

Der Preview-Player hat drei Video-Layer:
- **Slot A / Slot B** (`videoRefA`, `videoRefB`) — Ping-Pong-Paar, das während eines Übergangs die Crossfade-Animation zeigt.
- **Media Overlay** (`mediaVideoRef`) — **ein einziges** `<video>`-Element, das im Ruhezustand hochgeladene Media-Clips (wie Ihre beiden Szenen) darstellt.

Ablauf beim Ende eines Crossfades zwischen zwei Media-Szenen:

1. Während der Transition ist `activeVisualTransition` gesetzt → `mediaVideoRef.opacity = 0`, A/B übernehmen die Crossfade-Animation mit den richtigen Media-URLs.
2. Sobald `visualTimeRef` `tEnd` überschreitet, wird `activeVisualTransition` `null` → `mediaVideoRef.opacity` springt zurück auf `1`.
3. Aber `mediaVideoRef.src` zeigt entweder noch auf Szene 1 oder ist noch nicht neu gebunden (Rebind passiert erst im nächsten Tick der Media-Branch, Zeile ~789–797) → ein Frame lang wird Szene 1 (oder ein schwarzer Ladeframe) über der bereits korrekten neuen Szene aus dem A/B-Slot gezeigt → **Flash**.

Zusatz-Effekt: In der Media-Branch werden Slot A/B jeden Tick auf `opacity = 0` gezwungen (Zeile 765–767), was den Handoff-Frame aus `useTransitionRenderer` sofort wieder überschreibt.

## Lösung

Zwei koordinierte Änderungen, damit der Wechsel A/B → Media-Overlay in **einem Frame ohne Umbindung** passiert:

### 1. Media-Overlay während der Preparing-/Active-Phase pre-armen

In `useTransitionRenderer.ts`:

- Neuen optionalen Ref `mediaOverlayRef` (das gleiche Element wie `mediaVideoRef`) an den Hook durchreichen.
- Wenn die eingehende Szene `sourceMode === 'media'` ist:
  - In der **Preparing-Phase** (Pre-Seek-Fenster, 0.8 s vor `tStart`): `mediaOverlayRef.src` auf die Media-URL der neuen Szene setzen, an `original_start_time` seeken und **pausiert** halten, `opacity` bleibt bei `0`.
  - In der **Active-Phase**: Overlay-`currentTime` linear mitziehen (`incomingSourceStart + elapsed * rate`), damit im Handoff-Frame die exakt gleiche Frame-Position wie in Slot B/A steht.
  - Im **Handoff**: `mediaOverlayRef.opacity = 1` **im gleichen Tick** setzen, in dem der neue aktive A/B-Slot sichtbar wird, und einen `pendingHideRef`-artigen Deferred-Hide auf die A/B-Slots anwenden (1 Frame Overlap). Play() erst nach Bestätigung `readyState >= 2`.

### 2. Media-Branch nicht mehr blind die A/B-Slots auf `opacity 0` zwingen

In `DirectorsCutPreviewPlayer.tsx` (Media-Branch ~Zeile 763–770 und ~1130–1132):

- Vor `slotA.opacity = 0 / slotB.opacity = 0` prüfen, ob:
  - `transitionPhaseRef.current !== 'idle'`, **oder**
  - die Media-Overlay `readyState < 2` bzw. `currentSrc` noch nicht die aktuelle Szene ist.
- Solange eine dieser Bedingungen zutrifft, den aktiven A/B-Slot sichtbar lassen und `mediaVideoRef.opacity` erst dann auf `1` schalten, wenn beide Bedingungen erfüllt sind. Der A/B-Slot wird erst danach ausgeblendet — kein Frame ohne gültigen Layer.

### 3. `activeVisualTransition` erweitern

`activeVisualTransition` (Zeile 1564) darf für einen zusätzlichen 1-Frame-Cooldown nach `tEnd` `true` bleiben, damit die JSX-Regel `!activeVisualTransition && mediaOverlay opacity 1` nicht schon vor dem koordinierten Handoff greift. Umsetzung: einen `postTransitionHoldFramesRef` (Wert 2) im Player halten und `activeVisualTransition` durch `activeVisualTransition || postTransitionHoldFramesRef.current > 0` ersetzen.

## Betroffene Dateien

- `src/components/directors-cut/preview/useTransitionRenderer.ts` — neue `mediaOverlayRef`-Parameter, Pre-Arm-Logik in Preparing/Active, koordinierter Handoff mit Deferred-Hide auf A/B statt auf Overlay.
- `src/components/directors-cut/DirectorsCutPreviewPlayer.tsx`
  - Media-Branch: A/B-Opacity nur setzen, wenn Overlay wirklich bereit ist.
  - `activeVisualTransition` mit Post-Handoff-Cooldown (2 Frames) erweitern.
  - Zusätzliches Argument (mediaVideoRef) an `useTransitionRenderer` übergeben.

## Verifikation

1. Preview mit zwei Media-Video-Szenen und Crossfade laden.
2. Playhead über den Cut fahren — im Handoff-Frame darf **kein** schwarzer/alter Frame mehr sichtbar sein.
3. Console: keine neuen Warnings; `transitionPhaseRef` durchläuft `idle → preparing → active → idle` sauber.
4. Regressionscheck: Base-Video-only Cut (kein Media-Overlay) verhält sich unverändert (A/B-Ping-Pong nicht durch neue Overlay-Bedingungen blockiert).
