## Multi-Stem-Mixer

Neuer Mixer-Tab im Audio Studio, der die separierten Stems (Vocals/Drums/Bass/Other) aus
der bestehenden Stem-Separation-Pipeline nutzbar macht. Nach „Stems extrahieren" in der
Bibliothek öffnet sich automatisch der Mixer mit 4 Channel-Strips, Live-VU-Metern,
Mute/Solo, Pan, Master-Volume und 6 Mix-Presets (Karaoke, Acapella, Instrumental,
Vocal Focus, Drums+Bass, Original). Export als 48 kHz Stereo-WAV in die Bibliothek
oder als einzelner Stem-Download.

### Was der Nutzer sieht

1. In der **Bibliothek** Track wählen → „Stems extrahieren" → Edge Function läuft
2. Sobald 4 Stems da sind, Toast „Stems bereit zum Mixen" + automatischer Wechsel
   in den **Stem-Mixer**-Tab
3. **Mixer-UI**:
   - Transport-Bar mit Play/Pause + scrubbable Timeline
   - 6 Preset-Buttons (Karaoke macht Vocals stumm usw.)
   - 4 Channel-Strips mit Emoji + Farb-Coding pro Stem
     - Live-VU-Meter (RMS, animiert, Bond-Style)
     - Volume-Slider (0–150 %, Boost möglich)
     - Pan-Slider (L100–C–R100)
     - M/S Buttons (Mute/Solo, Solo überschreibt Mute auf anderen Spuren)
     - Single-Stem-Download als WAV (Icon im Channel-Header)
   - Master-Section mit Master-Volume + Reset-Button
4. „Mix speichern" → 48 kHz Stereo-WAV nach `audio-studio` Bucket + Eintrag in
   `universal_audio_assets` (source = `stem_mix`, processing_preset = `stem_mix`,
   effect_config enthält alle Channel-Settings für spätere Reproduzierbarkeit)

### Technische Architektur

**Neuer Hook** `useStemMixer.ts`:
- Decodiert alle Stems (parallel via shared AudioContext) zu AudioBuffers
- Live-Graph: pro Stem `BufferSource → Gain → StereoPanner → Analyser → MasterGain → Destination`
- Solo-Logik: jede Spur effektiv stumm wenn `muted` ODER (`anySolo && !solo`)
- Volume/Pan-Updates ohne Graph-Rebuild via `linearRampToValueAtTime` (20 ms Smoothing)
- Offline-Render via `OfflineAudioContext` mit identischem Graph
- VU-Meter: RMS aus 128-Sample Time-Domain-Window pro Frame
- `downloadStem(type)`: rendert nur eine Spur ohne Mute/Pan-Anwendung

**Neue Komponente** `StemMixerPanel.tsx`:
- Empty-State wenn keine Stems verfügbar (mit Hinweis auf Bibliothek)
- 6 Mix-Presets als Quick-Buttons → Custom-Badge wenn manuell verändert
- Channel-Border + Solo-Button-Background nutzen Stem-Farben für visuelle Identität
- Bond-2028 Style: backdrop-blur, gradient-Cards, framer-motion auf VU-Bars

**Geänderte Dateien**:
- `src/components/audio-studio/SoundLibrary.tsx`: neuer `onStemsExtracted`-Callback,
  feuert nach erfolgreichem Demucs-Run mit den 4 Stem-URLs + Original-Title
- `src/pages/AudioStudio.tsx`: neuer Tab `'stems'`, State `stemSet`, automatischer
  Wechsel nach Extraction, Wiring zu `setLibraryRefreshKey` für Mix-Speicherung

### Kosten

Der Mixer selbst ist **kostenlos** (alles client-side Web Audio).
Stem-Separation kostet weiterhin `STEM_SEPARATION_COST_EUR = 0.20 €` (unverändert).

### Out of Scope (für später)

- Per-Channel-EQ und Effekte (Reverb, Delay)
- Multi-Track-Recording (mehrere Stem-Sets gleichzeitig)
- Stem-Mixer-State persistieren (Mix-Templates)

## Final Mix Export Hub

Multi-Source Mixer-Hub im Audio Studio, der alle Audio-Quellen (Voiceover, AI Music,
Stem-Mix, SFX, externe URLs) zu einem finalen sendefertigen WAV mit Loudness-
Normalisierung kombiniert. Vorhandene Quellen aus dem Editor (aktuelles Voiceover +
zuletzt geladener Music-Track) werden beim Öffnen des Tabs automatisch eingefügt.

### Was der Nutzer sieht
1. **Sources-Liste**: Vorbelegte Voice/Music + manuell per URL oder Upload erweiterbar
2. Pro Source: Volume (0–150 %), Pan (L–R), Mute, Start-Offset, Lösch-Button
3. **Transport**: Play/Pause + scrubbare Master-Timeline + Master-Volume
4. **Loudness-Ziel**: 5 Presets (Spotify/YouTube –14 LUFS, Broadcast –23, Cinema –27, Off)
   + „Lautheit messen“-Button mit Δ-Anzeige zum Ziel
5. **Export**: Bibliothek (`universal_audio_assets`, source = `final_mix`) ODER direkter
   WAV-Download

### Technische Architektur
**Hook** `useFinalMixer.ts`:
- Decodiert alle Sources parallel, hält AudioBuffers in einer Map
- Live-Graph: pro Source `BufferSource → Gain → StereoPanner → MasterGain → Destination`
- Offset-aware Playback (Sources können zeitversetzt starten)
- Live-Updates für Volume/Pan via `linearRampToValueAtTime` (20 ms Smoothing)
- **Loudness-Messung**: vereinfachter ITU-R BS.1770-4 mit K-Weighting-Approximation
  (1st-order high-pass), 400 ms Blocks @ 75 % Overlap, Absolute Gating @ –70 LUFS,
  Relative Gating @ –10 LU. Liefert Integrated LUFS + True-Peak (Sample-Peak)
- **Normalisierung**: Linear-Gain auf Δ zum Ziel, gecappt auf ±12 dB, mit Soft-Clip
  (tanh) zum Schutz vor Übersteuerung
- Offline-Render via `OfflineAudioContext` (48 kHz Stereo) → 16-bit PCM WAV

**Komponente** `FinalMixPanel.tsx`:
- 4 Karten-Sektionen (Header, Sources, Transport+Master, Loudness, Export)
- Auto-Add `initialSources` beim Mount (aus `AudioStudio.tsx` State)
- Ampel-Farben für Δ-LUFS (≤1 grün, ≤3 amber, sonst rose)
- Bond-2028 Style: gradient-Cards, blur, motion auf Sources-Liste

### Kosten
**Komplett kostenlos** — alles client-side Web Audio + Storage-Upload für gespeicherte Mixe.
