## Diagnose der aktuellen Pipeline

Nach Review von `PreviewExportStep.tsx`, `UniversalCreator.tsx`, `RemotionPreviewPlayer.tsx`, `UniversalCreatorVideo.tsx` und `audioVolume.ts`:

**1. "Export effektiv 7%" ist ein Debug-Leak.**
Das Label in `PreviewExportStep.tsx:584` zeigt dem User die interne Ducking-Mathematik (`normalizedMusicVolume * normalizedMusicVolume * 0.28`). Das gehört nicht in eine Endkunden-UI — es entlarvt, dass der Slider nicht linear wirkt und verwirrt.

**2. Preview vs. Export sind numerisch bereits identisch, aber unehrlich.**
Beide Seiten rufen `getEffectiveBackgroundMusicVolume(rawVolume, hasVoiceover)` auf und übergeben denselben Wert an Remotion. Der User hört also in Preview und Render dasselbe. **Aber**: der Slider zeigt 50% und der wahre Mix ist 7% — das fühlt sich für den User "falsch" an, weil Slider ≠ hörbare Realität.

**3. Play/Pause reagiert nicht, Video loopt.**
Root Cause in `RemotionPreviewPlayer.tsx`:
- Zeile 286: `<MemoizedPlayer key={audioFingerprint} … />` — jeder Slider-Tick ändert `backgroundMusicVolume` → neuer Key → **kompletter Remount des Remotion-Players**. Play-State, Frame-Position und Event-Listener werden zerstört, bevor der User klicken kann.
- Zeile 95: `loop = true` als Default → das Video läuft endlos.
- Der Loop-Reset kombiniert mit ständigem Remount macht Pause optisch wirkungslos.

**4. Doppel-Wiring von Audio-Props.**
`stableAudioProps` (Zeile 110–120) inkludiert `backgroundMusicVolume` und `voiceoverVolume` als "stabil" — sie sind aber genau die Werte, die sich per Slider ändern. Der Memo greift dadurch nicht.

---

## Plan

### A. UI säubern (Kosmetik + Ehrlichkeit)
- `PreviewExportStep.tsx`: Zeile 584 auf reines `{Math.round(normalizedMusicVolume * 100)}%` reduzieren. Kein "Export effektiv" mehr.
- Slider-Wert = tatsächlich hörbarer Wert. Was der User einstellt, das kommt aus Preview UND Render — 1:1.

### B. Audio-Mix vereinfachen (ehrliche Kurve)
In `src/lib/audioVolume.ts`:
- Perceptual-Quadrat und aggressives 0.28/0.18-Ducking entfernen.
- Neue Regel: **Slider-Wert wird direkt benutzt**. Wenn Voiceover vorhanden ist, wird die Musik auf max. 40% des Slider-Werts geduckt (leichter Sidechain, aber kein Faktor-10-Absturz).
- Das VO wird mit `voiceoverVolume * masterVolume` gemischt (bleibt so).
- Ergebnis: Slider auf 50% ≈ 50% (oder 20% bei VO) — deckungsgleich in Preview und Render.

### C. Player-Verhalten reparieren
In `RemotionPreviewPlayer.tsx`:
- `audioFingerprint`-Key vom `<MemoizedPlayer>` entfernen. Remotion aktualisiert Volumen-Props live über `inputProps`; Remount ist unnötig.
- `stableAudioProps` auf **URL-only** reduzieren (`backgroundMusicUrl`, `voiceoverUrl`) — Volume-Props sind Live-Props, keine Identitäts-Props.
- Memo-Vergleich in `MemoizedPlayer` neu: nur bei URL-Wechsel oder Dauer-/Subtitle-Wechsel remounten.
- Default `loop = false`. Kleine Loop-Toggle-Ikone neben Play/Pause hinzufügen, damit User bewusst wählen kann.
- Play/Pause-Button: `onClickCapture` → `onClick` (sauberer, funktioniert nach Remount-Fix wieder).

### D. Kleiner Pipeline-Audit (Verbesserungsvorschläge)
Nicht in dieser Iteration umgesetzt, nur aufgelistet:
1. **Ein Master-Volume-Slider im Preview-Player entfernen** — er verwirrt neben Musik-/VO-Slider. Preview-Volume ist reine "Lautsprecher"-Regelung; Track-Mix macht der Export-Screen.
2. **Waveform-Indikator** auf dem Musik-Slider (visuelles Feedback wie Ducking-Zonen).
3. **VU-Mini-Meter** rechts vom Play-Button (grün/gelb/rot Peak Indikator, hilft dem User zu sehen, ob Musik VO überdeckt).
4. **Keyboard-Shortcuts**: Leertaste = Play/Pause, ←/→ = ±1s, M = Mute.
5. **"Only music"/"Only voice"-Solo-Buttons** zum Debugging des Mix.
6. **Auto-Ducking-Preset-Buttons** ("Kein VO", "Podcast", "Werbung") statt reines Slider-Fummeln.
7. **Preview-Player-Zustand persistieren** über Step-Wechsel (Frame-Position, Play-State) via sessionStorage.
8. **Ersten Frame preloaden**, damit der Player nicht mit schwarzem Bild startet.

Punkte 1–3 kann ich in einem Folge-Schritt umsetzen, sobald A–C laufen.

### E. Technische Nicht-Änderungen
- `UniversalCreatorVideo.tsx` Template: keine Änderung — es liest bereits `voiceoverVolume`, `backgroundMusicVolume`, `masterVolume` korrekt.
- Motion Studio, Lip-Sync, Composer, Render-Edge-Funktionen: unangetastet.
- Credit-Kosten, Render-Payload-Format: unverändert.

## Verifikation
- Slider 50 % → Preview-Musik hörbar bei ~50 % (bzw. ~20 % mit VO). Kein "effektiv"-Label.
- Play startet, Pause hält an, Loop-Toggle steuert Wiederholung.
- Volume-Slider-Änderung remountet den Player NICHT (Frame-Position bleibt erhalten).
- Render-Payload nutzt exakt denselben Zahlenwert wie der Preview.

## Risiko
Sehr niedrig. Alle Änderungen sind auf den Universal Creator Audio/Preview-Layer beschränkt. Kein Eingriff in Render-Farm, Lip-Sync oder Composer.
