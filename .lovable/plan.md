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
