
Ziel

- Den verbleibenden Stotterer nach jedem Director’s-Cut-Übergang entfernen, ohne das aktuell gute Transition-Timing wieder zu verschlechtern.

Was ich jetzt im Code als wahrscheinlichste Restursachen sehe

- `useTransitionRenderer.ts` lässt das Incoming-Video schon in `preparing` und `freeze` unsichtbar weiterlaufen (`incoming.play()`), obwohl der eigentliche Übergang noch nicht aktiv ist. Dadurch ist der nächste Clip beim Handoff bereits zu weit fortgeschritten.
- Im Handoff wird nur `incoming` eingefroren. `base` wird zwar auf den Zielzeitpunkt seeked, läuft aber nicht wirklich frame-stabil mit demselben sichtbaren Frame mit.
- Der Swap passiert noch zu früh: `seeked + readyState >= 2 + timeDiff < 0.1` heißt noch nicht, dass der richtige Base-Frame schon tatsächlich gerendert wurde.
- Der Boundary-Marker ist noch nicht wirklich exakt: `boundarySourceTime` wird aktuell mit dem Handoff-Ziel gefüllt statt mit der echten Boundary, und der Player prüft beim Skip nur `outgoingSceneId`.

Umsetzung

1. Preseek auf „buffern, nicht abspielen“ umstellen
- In `preparing` und `freeze` nur `seekIncoming(...)` ausführen.
- Incoming dabei pausiert und unsichtbar halten.
- `incoming.play()` erst beim Eintritt in `active` starten.
- Falls nötig beim ersten aktiven Frame einmal hart auf den erwarteten Incoming-Start synchronisieren.

2. Handoff wirklich frame-genau machen
- Beim Wechsel `active -> handoff` nicht nur `incoming`, sondern auch `base` sofort stabilisieren.
- `base` exakt auf denselben sichtbaren Frame bringen, den `incoming` gerade zeigt.
- `base` erst nach erfolgreichem Swap wieder normal weiterlaufen lassen.

3. Swap erst nach bestätigtem präsentem Frame
- Nicht mehr nur auf `seeked` vertrauen.
- Nach dem Seek zusätzlich auf einen wirklich präsentierten Base-Frame warten:
```text
bevorzugt: requestVideoFrameCallback
fallback: 1 RAF + strenger timeDiff
```
- Die Toleranz von `0.1` auf etwa `0.03–0.05` verschärfen.

4. Boundary-Skip wirklich exakt machen
- Im Renderer den Marker mit echter Boundary speichern:
```text
{
  outgoingSceneId,
  incomingSceneId,
  boundarySourceTime
}
```
- `boundarySourceTime` muss aus der echten Transition-Grenze kommen, nicht aus `handoffTargetTime`.
- Im Player nur dann skippen, wenn outgoing, incoming und Boundary wirklich zur aktuellen Grenze passen.

5. Reset-/Seek-Pfade sauber mitziehen
- Alle neuen Active-/Handoff-/Frame-Present-Refs bei manuellem Seek, Reset, Szenenänderungen und Transition-Änderungen zurücksetzen.
- Den bestehenden Cooldown behalten, aber nur noch als Zusatzschutz.

Technische Details

- Betroffene Dateien:
  - `src/components/directors-cut/preview/useTransitionRenderer.ts`
  - `src/components/directors-cut/DirectorsCutPreviewPlayer.tsx`

- Erwarteter Effekt:
```text
vorher:
preparing -> incoming läuft unsichtbar schon vor dem Übergang
active -> Übergang sieht gut aus
handoff -> base ist nicht exakt auf demselben präsentierten Frame
swap -> kleiner sichtbarer Hitch / leichter Vorsprung

nachher:
preparing -> incoming nur vorgeladen
active -> incoming startet exakt mit dem Übergang
handoff -> beide Videos werden auf denselben sichtbaren Frame synchronisiert
swap -> erst nach bestätigtem präsentem base-Frame
```

Verifikation

- Crossfade, Wipe, Slide, Push und Zoom testen
- Direkt auf die ersten 0.5–1.0s nach jedem Übergang achten
- Mehrere Übergänge direkt hintereinander testen
- Seek, Reset und Scrubbing testen
- Sicherstellen, dass Übergänge sichtbar bleiben und der nächste Clip nach dem Übergang nicht mehr leicht vorspringt
