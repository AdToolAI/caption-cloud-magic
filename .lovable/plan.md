## Autopilot Stage 4 — Schnittrhythmus & Ton-Design

Ziel: den „das ist KI"-Eindruck an den zwei Stellen entfernen, an denen er heute am hörbarsten/sichtbarsten ist — gleichförmiger Schnitt und tonlose Bilder.

### Ausgangslage (im Code geprüft)

- `src/lib/autopilot/rhythm.ts` und `src/lib/autopilot/soundDesign.ts` existieren vollständig, werden aber **nirgends importiert** — weder in `autopilot-treatment`, `autopilot-orchestrate` noch `autopilot-finalize`. Sie sind aktuell toter Code.
- `autopilot-treatment/index.ts` setzt `durationSeconds: 0` mit dem Kommentar „the rhythm planner owns this" — es gibt aber keinen Aufrufer, der die Dauer danach setzt.
- `autopilot-orchestrate/index.ts` rundet jede Szene auf **6s oder 10s** (`durationSeconds > 8 ? 10 : 6`) für Hailuo. Damit ist die geplante Rhythmik im Ergebnis egal.
- `autopilot-finalize/index.ts` legt für jede Szene dieselbe Transition (`fade`, 0.4s) und kennt nur **einen** Audio-Layer neben VO: Musik (`backgroundMusicUrl`). Kein Foley, keine Ambience.
- `UniversalCreatorVideo.tsx` hat im Schema nur `voiceover*`, `backgroundMusic*` und Szenen-Originalton — es gibt **keine** generische Zusatz-Audiospur. Ohne die geht Foley nicht in den Export.
- `generate-scene-sfx` (ElevenLabs Sound Generation, `kind: ambient|sfx|foley`, max 22s) existiert bereits, bucht aber 5 Credits gegen die **alte** `wallets`-Tabelle.

---

### Block 1 — Rhythmus wird wirksam

1. **Planer einhängen.** In `autopilot-treatment` nach dem Parsen der Szenen `applyRhythm(scenes, targetDuration)` und `diversifyCameraMoves(scenes)` anwenden (Logik als Deno-Kopie unter `supabase/functions/_shared/autopilotRhythm.ts`, damit Client und Server dieselben Gewichte nutzen). Ergebnis: Hook kurz, Proof/Emotion länger — statt heute 0.
2. **Schnitt statt Raster.** Der 6/10s-Snap in `autopilot-orchestrate` bleibt für die Generierung (Hailuo kann nichts anderes), aber die geplante Dauer wird in `duration_seconds` erhalten. In `autopilot-finalize` wird jede Szene auf ihre Plan-Dauer **beschnitten** statt den Rohclip komplett zu verwenden — d.h. der Clip läuft 6s, im Film stehen 4,3s.
   *Technisch:* der UCC-Szenen-Hintergrund braucht dafür `videoTrimStart`/`videoTrimEnd`. Falls das Schema das noch nicht führt, wird es in `UniversalCreatorVideo.tsx` ergänzt (siehe Block 3) — sonst bleibt der Rasterlook.
3. **Musik-Beat-Snap.** Musik wird in `autopilot-finalize` **vor** dem Zusammenschnitt gewählt; aus BPM/Dauer der Trackmetadaten werden Beat-Zeiten abgeleitet und `snapCutsToBeats(durations, beatTimes, 0.25)` auf die Schnittpunkte angewandt. Verschiebungen über 0,25s werden verworfen — der Plan schlägt den Beat.
4. **Transitions variieren.** Statt überall `fade 0.4s`: harter Schnitt am Hook, kurzer Cut zwischen Beats gleicher Szene, Fade nur an Kapitel-/Stimmungsgrenzen. Regel deterministisch aus dem Beat-Typ, kein Modellaufruf.

### Block 2 — Ton-Design entsteht wirklich

5. **Mix-Plan erzeugen.** In `autopilot-finalize` `planSoundDesign(scenes, genre)` aufrufen: pro Szene Ambience (aus dem Environment-Text abgeleitet) und Foley (aus `foleyHint`, den das Treatment bereits liefert), plus Musik-Gain und Duck-Level.
6. **Audio erzeugen.** Pro Szene mit Prompt ein Aufruf an `generate-scene-sfx`. Abrechnung läuft über `_shared/autopilotCredits.ts` (`chargeStage` mit Stage `sfx`), **nicht** über die alte `wallets`-Buchung — die wird für den Autopilot-Pfad umgangen, damit nicht doppelt belastet wird. Fehlgeschlagene Layer werden refundet und still übersprungen; ohne Foley entsteht trotzdem ein Film.
7. **Ducking.** Musik fällt unter Sprache auf `musicDuckTo` (0.18), Foley auf 0.22, Ambience auf 0.12 — Werte kommen aus `planSoundDesign`, jeder Wert läuft durch `clampGain` (verhindert den bekannten `IndexSizeError`).

### Block 3 — Der Export muss es tragen

8. **Zusatz-Audiospuren im Template.** `UniversalCreatorVideo.tsx` bekommt ein optionales `extraAudioTracks: [{ url, startTime, duration, volume, loop, fadeIn, fadeOut }]` und rendert diese als eigene `<Sequence><Audio>`-Paare — respektiert `silentRender` und `r33_audioStripped` wie die bestehenden Spuren.
9. **Szenen-Trim.** Falls nicht vorhanden, `videoTrimStart` am Szenen-Hintergrund ergänzen, damit Block 1.2 greift.
10. **Raw-Media-Invariant bleibt unangetastet.** Es werden nur Audiospuren und Schnittzeiten ergänzt — kein Grading, kein Filter. `rawMediaMode` bleibt gesetzt.

### Block 4 — Sichtbarkeit

11. Der Freigabedialog im Regietisch zeigt die Ton-Kosten getrennt aus (Ambience/Foley pro Szene), damit die Kostenvorschau ehrlich bleibt.
12. `ProductionStage.tsx` bekommt in der Ton-Phase Einzelzeilen pro Layer („Szene 3: Café-Raumton"), damit sichtbar ist, wofür bezahlt wird.

---

### Was das bringt und was nicht

Der Film bekommt danach ungleiche, beat-nahe Schnitte und eine Tonebene unter jedem Bild. Das ist der größte verbleibende Sprung Richtung „nicht KI-typisch".

Nicht enthalten: Best-of-2 auf Motion-Ebene und die Härtung der Lip-Sync-Strecke bei 3–4 Sprechern — beides bleibt offen und lohnt sich als eigener Schritt.

### Kosten

Pro Szene kommen ein bis zwei ElevenLabs-SFX-Clips dazu. Bei einem 30s-Spot mit 6 Szenen sind das etwa 0,10–0,20 € zusätzlich pro Film — im Verhältnis zu den Motion-Kosten vernachlässigbar.
