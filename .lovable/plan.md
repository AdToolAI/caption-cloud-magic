

## Bugfix: Voiceover spielt erst nach Scrub – nicht beim ersten Play

### Symptom
Voiceover generieren → Play drücken → kein Ton. Sobald man auf der Zeitleiste eine andere Stelle anspringt (Scrub), spielt der Ton korrekt.

### Ursache (in `src/components/video-composer/ComposerSequencePreview.tsx`)

**Problem 1 — Audio startet nie automatisch ab Lead-In:**
Der Audio-Sync-Effekt (Zeilen 549–563) läuft nur, wenn sich `[playing, voiceoverUrl, muted]` ändert. Beim Klick auf Play steht `globalTime = 0`, also greift `globalTime >= 0.4` **nicht** → `audio.pause()` wird ausgeführt. Während die Zeit dann tickt, wird der Effekt nie wieder ausgelöst und `audio.play()` nie aufgerufen. Erst beim Scrubben triggert ein anderer Codepfad das Abspielen.

**Problem 2 — Stummschaltung beim ersten Play:**
Default ist `muted: true` (Zeile 91, für AutoPlay-Policy beim Video). Das hidden `<audio>`-Element erbt diesen Wert via `audio.muted = muted` (Zeile 552). Selbst wenn die Play-Logik gefixt ist, wäre die Stimme stumm bis der Nutzer das Lautsprecher-Icon klickt.

### Fix

**Datei:** `src/components/video-composer/ComposerSequencePreview.tsx`

1. **Audio-Sync auch bei `globalTime`-Änderung neu evaluieren** (Zeilen 549–572): Beide Effekte zusammenführen, sodass beim Überschreiten der 0,4-s-Marke `audio.play()` ausgelöst wird:
   ```ts
   useEffect(() => {
     const audio = audioRef.current;
     if (!audio || !voiceoverUrl) return;
     audio.muted = muted;
     const targetAudioTime = Math.max(0, globalTime - VO_LEAD_IN_SECONDS);
     // currentTime nur anpassen wenn Drift > 0.25s (vermeidet Stutter)
     if (Math.abs(audio.currentTime - targetAudioTime) > 0.25) {
       audio.currentTime = Math.min(targetAudioTime, audio.duration || targetAudioTime);
     }
     if (playing && globalTime >= VO_LEAD_IN_SECONDS) {
       audio.play().catch(() => {});
     } else {
       audio.pause();
     }
   }, [playing, voiceoverUrl, muted, globalTime]);
   ```

2. **Voiceover ist nicht „muted" obwohl Video stumm ist** (separates Konzept): Das Voiceover ist die primäre Tonspur und soll standardmäßig hörbar sein. Lösung:
   - Beim Mount/Voiceover-Vorhandensein: `muted` automatisch auf `false` setzen, sobald `voiceoverUrl` verfügbar ist (einmalig per `useEffect`):
     ```ts
     useEffect(() => {
       if (voiceoverUrl) setMuted(false);
     }, [voiceoverUrl]);
     ```
   - Das Video bleibt stumm (auf den Slot-Elementen ohnehin meist via `mutedRef`), aber die Audio-Spur des Voiceovers spielt.

3. **Lead-In-Pre-Roll vermeiden**: Da der Effekt jetzt auf `globalTime` reagiert, kommt es zur Audio-Initialisierung erst bei ≥ 0,4 s. Damit der Player beim Drücken von Play nicht erst „stumm wartet", `audio.play()` schon bei `globalTime >= 0` triggern und das Lead-In allein durch `audio.currentTime = 0` bei Sekunden < 0,4 abbilden:
   ```ts
   // Wenn globalTime < Lead-In, halte Audio bei 0 — Browser dekodiert schon
   if (playing) {
     if (globalTime < VO_LEAD_IN_SECONDS) {
       try { audio.currentTime = 0; } catch {}
       audio.pause(); // bleibt stumm bis Lead-In erreicht
     } else {
       audio.play().catch(() => {});
     }
   }
   ```
   Das macht den Start sauber und reproduzierbar — egal ob über Play, Scrub oder Auto-Resume nach Loop.

### Verifikation
1. Voiceover generieren → Play drücken → nach ~0,4 s startet die Stimme **automatisch** (kein Tippen auf Lautsprecher nötig)
2. Pause → Play an gleicher Stelle → Audio läuft sofort weiter
3. Scrub auf 5 s → Audio springt synchron an die richtige Stelle
4. Stumm-Icon klicken → schaltet Voiceover stumm; erneut klicken → Voiceover wieder hörbar
5. Loop (Sequenz endet, springt auf 0 zurück) → Lead-In funktioniert beim Re-Start ebenfalls

### Risiko & Aufwand
- **Risiko: sehr niedrig.** Reine Hook-Logik in einer Datei, keine API-/DB-/Render-Änderung.
- **Aufwand:** ~3 Min — 1 Datei, ~15 Zeilen.

