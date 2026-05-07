# Problem
Im Export-Step ist trotz unmute kein AI-Mix-Sound (Ambient/SFX/Foley) hörbar. Voiceover/Music spielen, die KI-Clips nicht. Im Screenshot fehlt zusätzlich die "AI Mix · N"-Badge — Indiz, dass `useSceneAudioClips(project?.id)` für die aktive Projekt-ID **0 Clips** liefert, obwohl die DB für das Projekt `f458e595…` 9+ Clips enthält (alle mit korrekter `user_id`, `kind in ambient/sfx/foley`, public bucket `scene-sfx`).

# Drei wahrscheinliche Ursachen (in Reihenfolge)

1. **Projekt-ID-Drift**: `AssemblyTab` ruft `useSceneAudioClips(project?.id ?? null)`. Wenn beim Tab-Wechsel auf Export `project.id` kurz `undefined` ist (Draft aus sessionStorage hat noch keine `id`, oder DB-Hydrate noch nicht durch), löst der Hook nur `setClips([])` aus und lädt nicht nach. Es gibt zwar einen Reload-Event, der wird aber nur von `SoundDesignPanel` gefeuert — ein simpler Tab-Wechsel feuert ihn nie.
2. **Audio-Autoplay-Lockout pro Element**: `new Audio(url)` wird **nach** dem ersten Play-Klick erzeugt (Effect läuft erst wenn `sceneAudioClips` non-empty wird). Manche Browser (Safari/iOS, teils Chromium mit strenger Policy) verlangen pro neuem `HTMLAudioElement` eine Gesten-Aktivierung — `play()` rejected silent. Voiceover/Music funktionieren, weil deren `<audio>`-Tags **im JSX** existieren und beim allerersten User-Klick mitaktiviert werden.
3. **Stale-Closure beim Sync-Effect**: Der SFX-Sync-`useEffect` rebindet bei jedem `globalTime`-Tick. Wenn `sfxClipsTimeline` durch `playable`/`startOffsets` neu erzeugt wird (geschieht oft, da Memo-Deps), wird der vorherige Effect-Cleanup ausgeführt und nichts pausiert — passt, aber `play()`-Promises laufen ins Leere ohne Logging.

# Plan (3 Schritte, Frontend-only)

### 1. Diagnostic Logging (sofort sichtbar in Console)
- `useSceneAudioClips`: Logge `projectId`, `data.length`, evtl. `error.message` bei jedem Load.
- `ComposerSequencePreview` SFX-Init-Effect: Logge `sceneAudioClips.length`, jede `clip.id` + `url`, `audio.error` falls Load-Fehler.
- SFX-Sync-Effect: Bei jedem `play()`-reject `console.warn` mit `clip.id` + Reason.

### 2. Projekt-ID-Drift fixen (Hauptverdacht für leere Liste)
- `AssemblyTab`: useSceneAudioClips an `project?.id` koppeln — bereits so. **Zusätzlich**: Wenn `project?.id` von `null/undefined` → konkrete UUID wechselt, refetch erzwingen (der Hook tut das schon via `useCallback([projectId])` + `useEffect([load])`, aber wir verifizieren mit Log).
- Außerdem: in `useSceneAudioClips` einen *Realtime-Channel* auf `scene_audio_clips` (filter `project_id`) anhängen, damit auch externe Inserts (Sound-Mix-Lauf in anderem Tab) sofort propagieren.

### 3. Autoplay-Lockout härten
- SFX-Audio-Elements **nicht mehr per `new Audio()`** erzeugen, sondern als versteckte `<audio>`-Tags im JSX rendern (gleicher Mechanismus wie VO/Music). Map per `key={clip.id}` und `ref` via Callback in `sfxAudiosRef`.
- Beim ersten `togglePlay()`-Klick einmal alle SFX-Audios `audio.muted = true; audio.play().then(()=>audio.pause())` "primen" — hebt Autoplay-Lockout zuverlässig auf.
- `crossOrigin="anonymous"` setzen (Bucket ist public), damit der Browser CORS-sauber decodiert.

# Out of Scope
- Keine Backend/Edge-Function-Änderungen.
- Kein Eingriff in `compose-video-assemble`/`mux-audio-to-video` — das finale Render ist davon nicht betroffen.

# Verifikation
1. DevTools-Console nach Tab-Wechsel auf Export: `[useSceneAudioClips] projectId=… loaded N=9` muss erscheinen.
2. Badge "AI Mix · 9" erscheint im Preview-Header.
3. Play drücken → in Console keine `play() rejected`-Warnungen → Sound hörbar.
4. Falls weiter still: Console zeigt entweder `audio.error code=4` (CORS/404) oder `NotAllowedError` → richtet die nächste Iteration zielgerichtet aus.

# Geänderte Dateien
- `src/hooks/useSceneAudioClips.ts` (Logging + Realtime-Subscribe)
- `src/components/video-composer/ComposerSequencePreview.tsx` (JSX-Audio-Tags + Priming + Logging)
