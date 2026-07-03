## Ursache

In `src/remotion/templates/DirectorsCutVideo.tsx`, Funktion `renderTransitionLayer` (Zeile 788 ff.), rendert der Übergang zwei Layer übereinander:

- **zIndex 18 (unten):** eingehende Szene, `opacity = progress`
- **zIndex 20 (oben):** ausgehende Szene. Bei `placement !== 'centered'` als `<Freeze frame={0}>`, also der letzte Frame vor dem Cut, eingefroren.

Für `crossfade` / `dissolve` steht dort:
```ts
outgoingStyle = { opacity: 1 };
incomingStyle = { opacity: progress };
```
Der Kommentar begründet das damit, dass die ausgehende Szene "solide darunter weiterläuft". Das gilt aber **nur** für `placement === 'centered'`. Der Resolver in `src/utils/transitionResolver.ts` wählt `centered` nur, wenn beide Clips echte Source-Handles um den Cut haben — bei getrimmten AI-Clips (Standardfall im Director's Cut) fällt er auf `start-at-cut` zurück.

Bei `start-at-cut`:
- Haupt-Sequence der ausgehenden Szene ist am Cut **beendet**.
- Der eingefrorene Outgoing-Overlay mit `opacity: 1` liegt oben und **verdeckt** den eingehenden Layer die volle Transition-Dauer (~0.8 s).
- Nach Transition-Ende springt Szene 2 hart in Bild.

→ Genau das gemeldete Symptom: „Video hängt eine Sekunde am letzten Frame, dann läuft Szene 2 weiter, kein sichtbarer Übergang."

## Fix

**1. Kern-Fix** — `DirectorsCutVideo.tsx`, `renderTransitionLayer`, im `case 'crossfade' / 'dissolve'`:

```ts
case 'crossfade':
case 'dissolve':
  // Bei 'centered' läuft die ausgehende Haupt-Sequence noch darunter weiter,
  // Overlay bleibt solide. Bei 'start-at-cut' ist sie beendet — der eingefrorene
  // Overlay MUSS ausblenden, sonst hängt der letzte Frame sichtbar drüber.
  outgoingStyle = { opacity: rt.placement === 'centered' ? 1 : 1 - progress };
  incomingStyle = { opacity: progress };
  break;
```

Alle anderen Typen bleiben unangetastet:
- `fade` / `blur` / `zoom` blenden outgoing schon 1→0 (korrekt).
- `wipe` / `slide` / `push` brauchen die solide Outgoing-Fläche als Untergrund für Wipe/Slide (korrekt).

**2. Zweiter Codepfad geprüft** — Der `transitionOverlayOpacity`/`transitionVideoOpacity`-Block ab Zeile ~1113 sitzt **innerhalb von `SceneVideo`** und wird nur aktiv, wenn `transitions` an `SceneVideo` durchgereicht werden. Im Haupt-Renderpfad (`SceneRenderer`) und in `renderTransitionLayer` werden dort aber immer `transitions={[]}` übergeben (Zeilen 900 & 928) — dieser Block ist im Director's-Cut-Renderpfad tot und braucht keinen Fix. Keine Änderung nötig.

**3. Lambda-Bundle neu deployen** — Nach dem Code-Fix muss das Remotion-Bundle auf S3 gepusht werden, sonst rendert Lambda weiter das alte Bundle (siehe Memory `Lambda Bundle Deployment`). Ausführen:
```bash
./scripts/deploy-remotion-bundle.sh
```

## Verifikation

1. Fresh Render eines Director's-Cut-Projekts mit crossfade oder dissolve zwischen zwei getrimmten Clips.
2. Erwartet: echte Blende zwischen den Szenen statt eingefrorenem letzten Frame.
3. Regression-Check: eine Szene mit slide/wipe/push → Übergang muss weiterhin sauber laufen.

## Betroffene Datei

- `src/remotion/templates/DirectorsCutVideo.tsx` — 2 Zeilen im `case 'crossfade'` / `case 'dissolve'` Block.

## Nicht geändert

- Edge Functions, Resolver, Preview-Layer, Audio-Timing, Frame-Sequenz, andere Transition-Typen.
