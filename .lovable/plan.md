# Bug — Scene 1 bleibt im Voiceover & Untertitel‑Preview schwarz, Scene 2 spielt anschließend normal

## Beobachtung
Im Tab „Voiceover & Untertitel“ → Karte „Gesamtes Video — Vorschau“:
- Chip oben links zeigt korrekt „Szene 1 von 2“.
- Slot A bleibt komplett schwarz, Timer steht auf `0:00`.
- Nach exakt der Länge von Szene 1 wechselt die Anzeige zu Szene 2, die normal abspielt.
- Tritt erst auf, **nachdem** eine zweite Szene angelegt wurde. Mit nur einer Szene funktioniert dieselbe Komponente.
- Der gleiche Bug trat schon einmal auf und „löste sich von selbst“ – das war kein echter Fix, das Symptom kam zurück.

## Analyse (Code‑Ebene)

`src/components/video-composer/ComposerSequencePreview.tsx` arbeitet mit einem stateless Triple‑Buffer aus drei `<video>`‑Elementen (Slot A/B/C). Geladene Quelle und Opazität werden ausschließlich imperativ über Refs gesetzt; ein `forceRender()` kopiert sie in den Style.

Beim Hinzufügen einer zweiten Szene ändert sich die `playableSignature` (Zeilen 284–287) → der „destructive reset“‑Effect (Zeilen 288–313) läuft:

1. `activeSlotRef.current = 'A'`, `slotMapRef = {A:-1,B:-1,C:-1}`, alle `slot*SrcRef = undefined`.
2. `preloadSlot('A', 0)` → setzt `<video A>.src = scene1.clipUrl`, `el.load()`, `el.currentTime = 0`.
3. `preloadSlot('B', 1)` → `<video B>.src = scene2.clipUrl`.
4. `setOpacityForSlot('A', 1)` / `('B', 0)`.

Der Bug entsteht, weil `<video A>` über den Tab‑Wechsel hinweg im DOM erhalten bleibt. Beim Re‑Init wird derselbe HTMLMediaElement‑Knoten erneut benutzt – nur via `el.src = …; el.load()`. Chromium dekodiert in diesem Pfad nicht zuverlässig den ersten Frame, solange wir nicht `play()` aufrufen. Beim anschließenden Klick auf Play startet `v.play()` zwar die Decode‑Pipeline, aber das Element bleibt für die Dauer der ersten Szene auf Frame 0 schwarz (Decoder rendert keine Frames bis zum nächsten Seek/Reload), während `timeupdate` weiter feuert → nach exakt `durationSeconds` advanced er zu Scene 2, das auf Slot B sauber dekodiert wurde, weil dort der erste `.src`‑Set Aufruf wirklich neu war.

Das ist deckungsgleich mit dem Symptom („genau die Szenenlänge schwarz, dann Szene 2 normal“). Slot C (Prefetch) zeigt das nicht, weil Slot C versteckt ist und für die Wiedergabe nie als aktiv genutzt wird. Mit nur einer Szene wird der Reset gar nicht zweimal getriggert.

## Fix‑Strategie — schmal, ohne Logikbruch

Ich fasse genau eine Stelle an: das Mounten der `<video>`‑Elemente in `ComposerSequencePreview`. Alles andere bleibt unverändert.

1. **`key`‑basiertes Re‑Mount der drei Video‑Slots**
   - Den drei `<video>`‑Elementen (A/B/C) wird `key={playableSignature}` gegeben.
   - Wenn die Signatur sich ändert (= Szene wurde hinzugefügt/entfernt/clipUrl gewechselt), unmountet React die alten Elemente und mountet frische. Damit gibt es **keinen** wiederverwendeten `HTMLVideoElement`‑Decoder mehr und das „Frame 0 bleibt schwarz“ kann konstruktionsbedingt nicht mehr auftreten.
   - Die bestehenden Refs (`videoARef`, `videoBRef`, `videoCRef`) füllen sich automatisch neu.
2. **Slot‑Init nach Re‑Mount erzwingen**
   - Direkt nach dem Reset‑Effect (gleicher useEffect, Zeilen 288–313) zusätzlich ein `requestAnimationFrame` schedulen, das `setSrcForSlot('A', scene0.clipUrl)` + `setSrcForSlot('B', scene1.clipUrl)` nochmal aufruft, falls die Refs zum Zeitpunkt des Effects noch leer sind (kann beim Re‑Mount ein Tick dauern).
   - Garantiert, dass die `src`‑Attribute auf den **frisch gemounteten** Knoten landen und nicht auf den alten.
3. **Defensive „First‑Frame Paint“‑Pulse für Slot A**
   - Nach dem Setzen von `src` einmalig `el.play().then(() => el.pause())` mit `currentTime = 0` und `muted = true`. Das erzwingt Decode + Render des ersten Frames, ohne hörbar zu sein.
   - Nur für Slot A, nur einmal nach Reset, und nur wenn der User noch nicht auf Play geklickt hat.

Punkte 1+2 alleine sollten reichen; Punkt 3 ist eine zusätzliche Versicherung, die ich nur einbaue, wenn die ersten beiden in der lokalen Wiedergabe noch nicht 100 % liefern.

## Was NICHT angefasst wird
- Crossfade‑Logik (`performTransition`), Watchdog, Image‑Ticker, Voiceover‑/Music‑/SFX‑Sync, Subtitle‑Renderer.
- `VoiceSubtitlesTab.tsx`, Hooks, Edge‑Functions, Render‑Pipelines, Lip‑Sync, Sync.so‑Pfad.
- Keine neuen Props, keine Datenbankänderungen, keine Migrations.

## Risiken
- Der `key`‑Wechsel beim Hinzufügen/Entfernen einer Szene re‑mountet die `<video>`‑Tags – ein laufender Decode wird verworfen. Da der Reset‑Effect ohnehin alle Timer killt, `setPlaying(false)` setzt und auf Szene 0 springt, ist das das erwartete Verhalten und ohne sichtbaren Nachteil.
- Kein Einfluss auf bereits funktionierende Single‑Scene‑Vorschauen, da deren Signatur erst beim Editieren wechselt.

## Verifikation
- Manuell: 1 Szene rendern → Tab öffnen → Play → läuft. Zweite Szene rendern → Tab erneut öffnen → Play → Scene 1 zeigt Bild ab Frame 0, läuft, crossfade in Scene 2.
- Console‑Log eines bestehenden `[Preview]`‑Marker zur Bestätigung, dass kein Watchdog mehr feuert.

## Technical Section
- Datei: `src/components/video-composer/ComposerSequencePreview.tsx`
- Änderungen:
  - JSX (Slot A/B/C): `key={playableSignature}` ergänzen.
  - Reset‑Effect: nach `preloadSlot(...)` einen `requestAnimationFrame` setzen, der die Slot‑Init wiederholt falls Refs gerade frisch sind.
  - Optional Pulse: nach Init für Slot A `el.muted=true; el.play().then(()=>el.pause()).catch(()=>{})`.
