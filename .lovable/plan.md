

## Was ich aus den Daten sehe

Ich habe das Projekt `Grusselgeschichten` (8 Szenen) analysiert. Reale vs. konfigurierte Längen:

```text
Szene 1: configured 7.0s → real 5.875s  (Δ -1.125s) → Übergang fade
Szene 2: configured 8.0s → real 10.125s (Δ +2.125s) 
Szene 3: configured 6.0s → real 5.875s
Szene 4: configured 8.0s → real 10.125s
Szene 5: configured 9.0s → real 10.125s
Szene 6: configured 7.0s → real 5.875s  (Δ -1.125s) → Übergang zoom→fade
Szene 7: configured 8.0s → real 10.125s
Szene 8: configured 7.0s → real 5.875s
```

**Auffällig**: Übergang **1→2** (Szene 1 verkürzt um 1.125s) und **6→7** (Szene 6 verkürzt um 1.125s) — exakt deine zwei Problemstellen. Die Szenen werden REAL **1.125s früher beendet** als das VO erwartet.

## Der eigentliche Bug

Drei Komponenten rechnen mit **unterschiedlichen** Komposition-Längen:

| Komponente | nutzt | Komposition |
|------------|-------|-------------|
| WAV-Padding (`VoiceSubtitlesTab.tsx`) | nominelle 7s/8s/... | **57.0s** |
| Edge Function (`compose-video-assemble`) | reale 5.875/10.125/... | **61.0s** |
| Renderer (`ComposedAdVideo.tsx`) | bekommt reale Werte vom Edge | **61.0s** |

Das WAV ist auf 57s gepaddet, die Komposition ist 61s. **Aber wichtiger**: das gesprochene VO ist auf nominelle Szenen-Längen ausgerichtet (Satz für Szene 1 dauert ~6.5s passend zu 7s-Slot). Wenn Szene 1 real nur 5.875s dauert und dann ein 0.5s-Fade startet, liegt das VO-Ende des "Szene-1-Satzes" mitten im Fade — wahrscheinlich **schneidet die Sprachpause oder das Satz-Ende zwischen den Audio-Decoder-Chunks an der Übergangsstelle**.

## Lösung: WAV-Padding muss die REALEN Dauern nutzen, nicht die nominellen

Die WAV-Generierung in `VoiceSubtitlesTab.tsx` Zeile 232 nutzt `scenes[i].durationSeconds` — das ist der UI-State-Wert (nominell 7s). Der Server probt aber später beim Render die echten 5.875s. **Diese beiden müssen identisch sein.**

### Konkrete Fixes

**1. `VoiceSubtitlesTab.tsx` (WAV-Padding-Berechnung):**
- VOR der WAV-Generierung: für jede Szene das echte MP4 probe (`new Audio(s.clipUrl); audio.duration`)
- Diese realen Werte für die `compositionSeconds`-Berechnung nutzen, NICHT die nominellen UI-Werte
- Damit ist das WAV exakt so lang wie die echte Komposition

**2. Beim Hailuo-Clip-Generierung-Callback (`ClipsTab.tsx`):**
- Wenn ein Clip fertig ist, das echte MP4 kurz proben (Audio-Element loadedmetadata)
- `duration_seconds` in der DB überschreiben mit der realen Länge
- Damit ist UI-State = DB = Edge = Renderer permanent in Sync
- Der User sieht in der UI auch die echten Längen statt der nominellen — kein Mismatch mehr möglich

**3. Edge Function bleibt unverändert** — sie probed bereits korrekt.

**4. Renderer bleibt unverändert** — er nimmt bereits `durationSeconds` 1:1.

### Warum dieser Fix die Wurzel trifft

Aktuell ist die Pipeline asynchron:
- UI-State sagt "7s" → WAV wird mit 7s-Slots erzeugt → Edge probed "5.875s" → Komposition wird 5.875s → WAV-Slot von 7s wird auf 5.875s zusammengedrückt → Sprachende fällt in den Fade-Übergang.

Nach dem Fix:
- Clip wird generiert → echte Dauer 5.875s wird sofort in DB & UI geschrieben → User sieht "5.875s" → VO wird mit 5.875s-Slots erzeugt → Edge probed (gleiche) 5.875s → Komposition 5.875s → WAV-Slot perfekt deckungsgleich → kein VO-Cut.

### Verify nach Fix

1. Im Composer alten Clip-Slot anschauen: `duration_seconds` in DB sollte jetzt **5.875s** stehen statt **7s** (für Szene 1 und 6)
2. Beim VO-Generieren in der Console-Log: `[VO] WAV pad applied, exact duration X.XXs (comp Y.YYs)` — `comp` muss == Edge-Function `durationInFrames/fps` sein
3. Render starten, Übergang 1→2 prüfen: Sprache läuft sauber durch, kein Schnitt
4. Optional: das WAV vorher per ffprobe checken — `realDur < compositionSeconds` darf nicht sein

### Lambda-Bundle nach Fix

Der Renderer-Code ändert sich **nicht** — `ComposedAdVideo.tsx` bleibt wie es ist. Du musst das Bundle diesmal NICHT redeployen.

## Geänderte Dateien

1. `src/components/video-composer/VoiceSubtitlesTab.tsx` — vor WAV-Padding alle Szenen-MP4s proben, reale Dauern für `sumSceneFrames` benutzen
2. `src/components/video-composer/ClipsTab.tsx` (oder dort wo Clips ankommen) — beim Clip-ready-Event echte MP4-Dauer messen und `duration_seconds` in `composer_scenes` updaten
3. Optional: `src/lib/probeMp4Duration.ts` — neue Utility (Browser-seitig via `<Audio>` oder `<Video>` element loadedmetadata)

