## Audio Ducking — Speech-aware Music Mixing

Wenn Nutzer Voiceover/Sprache + Musik kombinieren, wird die Musik bisher als konstanter Layer abgespielt. Profi-Workflow erfordert **Ducking**: Musik automatisch um -6 bis -18 dB absenken, sobald gesprochen wird, und sanft wieder hochfahren in Sprechpausen. Dieses Feature schließt die letzte Pro-Lücke im Audio Studio und macht jeden generierten/uploadeten Track sofort sendefähig — komplett im Browser, kein zusätzlicher Server-Render.

### Was der Nutzer bekommt

1. **Neuer Tab „Ducking"** im Audio Studio, sichtbar sobald sowohl ein Voiceover/Speech-Track (das hochgeladene Original) als auch ein Music-Track (aus Beat-Sync, AI Music oder Library) vorhanden ist
2. **Live-Preview**: Beide Tracks gemischt im Browser via Web Audio API, mit Echtzeit-Ducking
3. **Visualisierung**: Zwei übereinander liegende Waveforms (Speech oben, Music unten) plus eine **Ducking-Hüllkurve** (Volume-Automation als Linie über dem Music-Track), die zeigt, wann/wie stark abgesenkt wird
4. **Presets**: „Subtil" (-6 dB), „Standard" (-12 dB), „Aggressiv" (-18 dB), „Custom"
5. **Feintuning**: 4 Slider — Threshold (ab welcher Sprach-Lautstärke duckt), Reduktion (in dB), Attack (wie schnell runter, 50–500 ms), Release (wie langsam hoch, 200–2000 ms)
6. **Export**: „Gemischten Track exportieren" → rendert offline in WAV/MP3, speichert als neues Asset in `universal_audio_assets` mit `source: 'ducked_mix'`. Direkt in Beat-Sync und Director's Cut nutzbar
7. **„An Director's Cut senden"** Button → übernimmt den fertigen Mix als Audio-Layer

### UX-Flow (typisch)

```text
1. User uploaded Voiceover.mp3
2. User generiert AI Music Track ODER lädt Track in Beat-Sync
3. Tab „Ducking" wird automatisch sichtbar (rot pulsierender Indikator: NEU)
4. Klick → Beide Waveforms erscheinen, Standard-Preset (-12 dB) aktiv
5. Play → Live gemischt hörbar, Ducking-Hüllkurve animiert mit Playhead
6. Anpassen → „Exportieren" → Mix in Library + Toast „Mix gespeichert · 2:34"
```

### Technische Umsetzung

#### Speech-Detection-Strategie (kein Server-Aufruf bei jedem Render)

Zwei-Pfad-Ansatz, abhängig davon ob Transkript vorhanden ist:

- **Pfad A — Transkript vorhanden** (Standard, da `transcribe-audio` Edge Function bereits Word-Timestamps liefert): Das vorhandene `transcript`-State-Array (`{word, start, end, type}`) wird zu **Speech-Aktivitäts-Intervallen** zusammengefasst (zusammenhängende Wörter mit < 300ms Gap = ein Sprach-Block). Das ergibt eine deterministische, präzise Ducking-Hüllkurve ohne weitere API-Calls.
- **Pfad B — Kein Transkript**: Client-seitige RMS-Energie-Analyse via `OfflineAudioContext` (chunks à 50 ms, Threshold-basiert). Bereits in der Codebase als Pattern vorhanden für Waveform-Generierung. Kein zusätzlicher API-Call.

#### Live-Preview mit Web Audio API

```text
SpeechAudio ──► GainNode (1.0) ──┐
                                 ├──► Destination
MusicAudio ──► GainNode (Auto) ──┘
                    ▲
                    │
              VolumeAutomation
              (linearRampToValueAtTime an Speech-Intervall-Grenzen)
```

Beim Play wird die Music-GainNode-Automation einmalig vor-programmiert (`gain.linearRampToValueAtTime(0.25, t_attack)` an jedem Speech-Start, `gain.linearRampToValueAtTime(1.0, t_release)` an jedem Speech-Ende). Synchron mit `<audio>`-Playhead.

#### Offline-Export

`OfflineAudioContext` mit identischem Graph rendert den Mix in einem Pass (mehrfach schneller als Echtzeit). Resultat → `audioBufferToWav` (Helper existiert bereits in `src/lib/audioToWav.ts`) → Upload nach `audio-studio` Storage Bucket → Insert in `universal_audio_assets` mit `type: 'mix'`, `effect_config: { type: 'duck', threshold, reduction_db, attack_ms, release_ms }`.

### Neue Dateien

- `src/components/audio-studio/AudioDuckingPanel.tsx` — Hauptkomponente (Preset-Karten, Slider, Dual-Waveform mit Hüllkurven-Overlay, Export-Button)
- `src/components/audio-studio/DuckingEnvelopeOverlay.tsx` — SVG-Overlay über der Music-Waveform für die Volume-Automation
- `src/hooks/useAudioDucking.ts` — Hook: kapselt AudioContext-Lifecycle, Speech-Intervall-Berechnung, Live-Preview-Steuerung, Offline-Export
- `src/lib/duckingEnvelope.ts` — reine Logik: `transcriptToSpeechIntervals()`, `intervalsToGainAutomation()`, `rmsBasedSpeechDetection(audioBuffer)`

### Geänderte Dateien

- `src/pages/AudioStudio.tsx` — neuer Tab `'ducking'` in `activeTab`-Union zwischen `beat-sync` und `filler`; Sichtbarkeits-Logik (Tab nur enabled wenn Speech-Audio + Music-Track vorhanden); State-Sharing für `musicUrl` und `transcript` an das Panel
- Kein Backend nötig: keine neue Edge Function, keine DB-Migration, kein Credit-Verbrauch (Mixing läuft komplett client-seitig). Der Export speichert nur in einen existierenden Bucket.

### Akzeptanzkriterien

1. Tab erscheint nur, wenn Voiceover-Audio (von Upload) UND Music-Track (von Beat-Sync, AI Music oder Library) geladen sind
2. Live-Preview ist hörbar synchron — Musik geht innerhalb von 100 ms hörbar runter, sobald Sprache einsetzt
3. Ducking-Hüllkurve visualisiert die exakte Volume-Automation als animierte Linie
4. Preset-Wechsel updated Hüllkurve und Live-Mix sofort (< 50 ms)
5. Export erzeugt valide WAV/MP3-Datei in Original-Länge, Mix klingt identisch zur Live-Preview
6. Exportierter Track erscheint sofort in Sound Library (mit Filter „Mixes")
7. „An Director's Cut senden"-Button hängt den Mix als Audio-Track an die Timeline
8. Funktioniert ohne Transkript via RMS-Fallback (etwas weniger präzise, aber brauchbar)

### Out of Scope (V2)

- **Multi-Source-Ducking**: aktuell nur 1 Speech + 1 Music. Mehrere Music-Layer kommen später
- **Side-Chain-Compression mit Look-Ahead**: aktueller Ansatz nutzt feste Attack/Release-Werte, kein dynamischer Compressor
- **Musik-Mastering** (LUFS-Normalisierung auf -14 LUFS für Streaming) — eigener Schritt, eigenes Feature
