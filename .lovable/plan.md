## Befund (verifiziert im Code)

Beides hat dieselbe Ursache in `src/components/universal-creator/RemotionPreviewPlayer.tsx`:

- Der Autoplay-Effekt (Zeile 305–311) startet den Player **bevor** der Effekt registriert wird, der die `play`/`pause`/`ended`-Events abhört (Zeile 313–351). Das `play`-Event feuert also ins Leere, `isPlaying` bleibt dauerhaft `false`.
- Folge 1: Der Button zeigt weiter das Play-Symbol (siehe Screenshot: Video läuft, Icon = ▶) und ruft `handlePlayClick` statt `handlePauseClick` auf → Pausieren unmöglich, das Video wirkt wie eine Endlosschleife. Erst ein Klick in die Zeitleiste bringt den Zustand durcheinander/wieder in Gang.
- Folge 2: Autoplay startet bewusst stumm (`setVolume(0)`, `initiallyMuted`). Entstummt wird nur in `handlePlayClick`. In Schritt 4 läuft der Player per Autoplay – dieser Pfad wird nie durchlaufen, also kein Voiceover. In Schritt 5 ist `autoPlay={false}` (PreviewExportStep Zeile 622), dort klickt der Nutzer aktiv auf Play → VO hörbar. Genau das beschriebene Verhalten.

## Änderungen

**1. `src/components/universal-creator/RemotionPreviewPlayer.tsx`**
- Event-Listener-Effekt vor den Autoplay-Effekt ziehen, damit `play`/`pause`/`ended` nie verloren gehen.
- Beim Registrieren den echten Zustand übernehmen: `setIsPlaying(player.isPlaying())` statt blind `false`.
- Listener über Refs stabil halten (Handler in `useRef` gespiegelt), damit das Ab-/Anmelden nicht bei jedem `isPlaying`/`isDragging`-Wechsel passiert und dabei Events verschluckt werden.
- Play/Pause-Button als echten Toggle absichern: bei Klick immer den tatsächlichen Player-Status (`player.isPlaying()`) auswerten, nicht nur den React-State.
- `handlePauseClick` zusätzlich robust: Player pausieren, Preview-Audio pausieren, `isPlaying` sofort auf `false` setzen (optimistisch), damit das Icon nicht hängt.
- Beim Umschalten von stumm auf laut während laufender Wiedergabe VO/Musik korrekt einsetzen (funktioniert automatisch, sobald `isPlaying` stimmt).

**2. Voiceover ab Schritt 4**
- Ein automatisches, unstummes Abspielen ist im Browser nicht erlaubt (Autoplay-Policy). Deshalb: das Live-Preview-Panel in `src/pages/UniversalCreator/UniversalCreator.tsx` (Zeile 718–738) mit `autoPlay={false}` betreiben – identisch zu Schritt 5. Damit startet der Nutzer die Vorschau bewusst per Play und hört Voiceover + Musik ab Schritt 4 genauso wie in Schritt 5, statt eine stumme Dauerschleife zu sehen.

## Prüfung
- Schritt 4 öffnen: Vorschau steht still, Klick auf Play → Bild + Voiceover laufen synchron, Icon wechselt zu Pause, Klick auf Pause stoppt sofort.
- Loop-Button, Mute-Toggle, Lautstärke und Zeitleisten-Seek weiterhin korrekt.
- Schritt 5 unverändert.
