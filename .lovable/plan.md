

# Roadmap: Von r54 zu Loft-Film Qualität

## Ausgangslage (r54 — aktueller Stand)

Was funktioniert:
- 5/5 Szenen sichtbar, keine schwarzen Frames
- AI-generierte Bilder (Replicate Flux) als Hintergrund
- SVG-Charakter (rechts unten) mit Gestik pro Szene
- Glassmorphism Text-Overlay mit Headline + Body
- Fade-Transitions (0.5s)
- Sound Effects (whoosh, pop, success)
- Scene-type-spezifische Gradient-Fallbacks

Was blockiert ist (r42 Bundle auf S3):
- `parallax`, `popIn`, `flyIn`, `morphIn` Animationen → crashen
- `morph` Transitions → crashen
- Lottie-Charakter → Lambda-Hang
- Bundle-Canary: `2026-03-04-r9` — über eine Woche alt

## Der kritische Engpass

**Das S3-Bundle ist veraltet.** Die gesamte Qualitätssteigerung hängt davon ab, ein neues Bundle zu deployen. Ohne neues Bundle bleiben alle Animation-Verbesserungen im Code, werden aber nie gerendert.

## Phasen-Plan

### Phase 1: Neues S3-Bundle deployen (BLOCKER für alles weitere)
**Was:** Neuen Remotion-Build auf S3 hochladen mit aktuellem Code
**Warum:** Das aktuelle Bundle (r42) hat strukturelle Bugs. Jede Verbesserung in `UniversalCreatorVideo.tsx` hat erst Wirkung, wenn Lambda das neue Bundle lädt.
**Wie:**
- Bundle-Canary auf `r55` aktualisieren
- `npx remotion lambda sites create` ausführen
- `REMOTION_SERVE_URL` Secret aktualisieren
- Smoke-Test mit einem kurzen Video

### Phase 2: Animationen freischalten (nach neuem Bundle)
**Was:** Die blacklisted Animationen (`popIn`, `flyIn`, `parallax`, `kenBurns`) im neuen Bundle testen und freigeben
**Wie:**
- Blacklist in `auto-generate-universal-video` schrittweise reduzieren
- Test-Render pro Animation-Typ
- `kenBurns` für Image-Szenen aktivieren (langsamer Zoom über Bilder — Loft-Film Signature-Effekt)
- `parallax` für Feature-Szenen aktivieren (Tiefenwirkung)

### Phase 3: Text-Overlays auf Loft-Film Niveau
**Was:** Aktuell zeigt der Text-Overlay `scene.voiceover` als Body-Text. Loft-Film nutzt:
- Größere, zentrierte Headlines mit Glow-Effekt
- Animierter Text (typewriter, splitReveal, glowPulse) — aktuell im Code vorhanden, aber `disableAnimatedText` war lange `true`
- Scene-Type Badges (`[HOOK]`, `[PROBLEM]`, `[LÖSUNG]`) mit farbigen Tags
- Bessere Positionierung: Hook/CTA = center, Content = bottom

**Wie:**
- `TextOverlay`-Komponente im Template überarbeiten für größere Typografie
- Scene-Type Badge als kleines Label über der Headline
- Text-Truncation auf ~2 Zeilen (Voiceover als visueller Anker, nicht als Volltext)

### Phase 4: Morph-Transitions + Szenen-Übergänge
**Was:** Aktuell nur `fade`. Loft-Film nutzt:
- Crossfade zwischen thematisch ähnlichen Szenen
- Slide-Transitions für Kontrast (Problem → Solution)
- Wipe für CTA-Szenen

**Wie:**
- Im neuen Bundle `morph` testen — wenn stabil, Blacklist entfernen
- Transition-Logik in Edge Function: Scene-Type-basierte Zuordnung statt immer `fade`
- `crossfade` für Hook→Problem, `slide` für Problem→Solution, `fade` als Default

### Phase 5: Audio-Muxing + Voiceover Integration
**Was:** Aktuell `silentRender: true` + nachträgliches Audio-Muxing. Qualitätsverbesserung:
- Voiceover-Timing pro Szene synchronisieren
- Background-Music Ducking (leiser bei Sprache)
- Beat-Sync Transitions (Szenenwechsel auf Musikbeat)

**Wie:**
- `SceneAudioManager` ist im Template bereits implementiert
- Sicherstellen, dass `mux-audio-to-video` Edge Function korrekt Voiceover + Musik kombiniert
- Beat-Detection Daten aus `audio-beat-detection` Edge Function nutzen

### Phase 6: Charakter-System verbessern
**Was:** Aktuell einfacher SVG-Charakter (blaues Hemd, statische Pose). Loft-Film hat:
- Verschiedene Character-Sets (Business, Tech, Casual)
- Gestik-Animationen (Pointing mit Arm-Bewegung, nicht nur statische Pose)
- Lip-Sync bei Voiceover

**Wie:**
- SVG-Character-Komponente (`AnimatedCharacter`) mit CSS-Animationen erweitern (Arm-Schwenk, Kopfnicken)
- Character-Set Auswahl im Briefing (Wizard Step 1)
- Lip-Sync über `phonemeTimestamps` — bereits im Template verkabelt, braucht nur valide Daten

### Phase 7: Karaoke-Untertitel
**Was:** `PrecisionSubtitleOverlay` mit Wort-für-Wort Highlighting ist bereits im Code. Aktuell `disablePrecisionSubtitles: true`.
**Wie:**
- Subtitles aus Voiceover-Transkription generieren (Whisper API oder ElevenLabs Timestamps)
- Phoneme-Timestamps für Karaoke-Effekt
- Im neuen Bundle testen und freigeben

## Priorisierung

```text
Phase 1 (Bundle)     ████████████ BLOCKER — ohne das geht nichts
Phase 2 (Animationen) ████████     Größter visueller Impact
Phase 3 (Text)        ██████       Professionelleres Erscheinungsbild
Phase 4 (Transitions) █████        Fließendere Szenenübergänge  
Phase 5 (Audio)       ████         Bereits implementiert, braucht Testing
Phase 6 (Charakter)   ███          Nice-to-have, SVG reicht vorerst
Phase 7 (Untertitel)  ██           Letzter Feinschliff
```

## Empfehlung: Nächster Schritt

**Phase 1 starten** — neues S3-Bundle deployen. Das ist der einzige echte Blocker. Danach können Phase 2-4 in einem Sprint umgesetzt werden, weil der Code großteils bereits existiert und nur freigeschaltet werden muss.

Soll ich mit Phase 1 (Bundle-Deploy) beginnen?

