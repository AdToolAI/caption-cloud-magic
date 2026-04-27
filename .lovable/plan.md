## Music-to-Video Auto-Match

Ein neuer One-Click-Workflow im Audio Studio: Nutzer lädt ein Video hoch → System analysiert Mood, Pace, Schnittfrequenz und Länge → generiert automatisch einen perfekt passenden AI-Soundtrack (richtige BPM, exakte Länge, passendes Genre/Mood). Schließt den End-to-End-Workflow „Video rein, fertiger Soundtrack raus".

### Was der Nutzer sieht

Neuer Tab **„Auto-Match"** im Audio Studio, prominent zwischen *Music* und *Library*:

1. **Drop-Zone** für Video (mp4/mov, bis 200 MB) oder „Aus Mediathek wählen"
2. **Analyse-Phase** (10–20 s): animierte Pipeline-Anzeige
   - Schnittfrequenz erkennen → empfohlene BPM
   - Visuelle Mood-Klassifikation (Energy, Brightness, Pace) → Genre + Mood
   - Exakte Videolänge → Track-Dauer
3. **Match-Card** mit Vorschlag (z. B. „Cinematic Build-Up · 128 BPM · 47 s · Energetic")
   - Buttons: **„Track generieren" (1-Click)** | **„Anpassen"** (öffnet Music Generator mit vor-ausgefüllten Werten)
4. **Generierter Track** wird gespeichert, an Beat-Sync gesendet, optional direkt mit Ducking-Tab gemixt

### Technische Architektur

**Neue Edge Function** `auto-match-music-to-video`:
- Input: `video_url`, `duration`, optional Frame-Hints aus Client
- Schritt 1: Schnittfrequenz aus `analyze-video-scenes` (existiert) → BPM-Mapping (z. B. 0.3 cuts/s → 90 BPM, 1.0 cuts/s → 140 BPM)
- Schritt 2: Mood-Analyse via Lovable AI (`google/gemini-3-flash-preview`) auf 4–6 Sample-Frames → JSON `{genre, mood, energy, brightness, descriptors[]}`
- Schritt 3: Prompt-Builder kombiniert Ergebnisse zu Music-Prompt
- Output: `{ recommendation: { bpm, durationSec, genre, mood, prompt, descriptors }, analysis: { cutsPerSecond, sceneCount, dominantMood } }`

**Client-Flow**:
- Neuer Hook `useMusicAutoMatch.ts`: orchestriert Frame-Extraktion (Canvas-API, ~6 Frames gleichmäßig verteilt), Edge-Call und Übergabe an `useMusicGeneration`
- Neue Komponente `AutoMatchPanel.tsx`: Upload + Analyse-UI + Match-Card + Generate-Button
- Wiederverwendung: `MusicGeneratorPanel` mit neuen Props `prefillPrompt`, `prefillGenre`, `prefillMood`, `prefillDuration`, `prefillBpm` für „Anpassen"-Pfad

### BPM-Mapping (deterministisch, transparent)

```text
Cuts pro Sekunde   → BPM
< 0.2              →  75  (slow / cinematic)
0.2 – 0.4          →  95
0.4 – 0.7          → 115
0.7 – 1.0          → 128
1.0 – 1.5          → 140
> 1.5              → 160  (high-energy / EDM)
```

Mood-Override durch AI-Analyse möglich (z. B. „dark + slow cuts" → 70 BPM Drone statt 75 BPM Folk).

### Kosten & Credits

- Analyse: ~0,02 € (Lovable AI Vision auf 6 Frames) — wird **kostenlos** angeboten (Marketing-Hook)
- Track-Generierung nutzt bestehende `generate-music-track`-Pipeline mit existierenden Tier-Preisen (€0.10 / €0.35 / €1.40)
- Tier-Auswahl bleibt beim Nutzer im finalen Generate-Step

### Dateien

**Neu**:
- `supabase/functions/auto-match-music-to-video/index.ts`
- `src/hooks/useMusicAutoMatch.ts`
- `src/components/audio-studio/AutoMatchPanel.tsx`

**Geändert**:
- `src/pages/AudioStudio.tsx`: neuer Tab `'auto-match'`, Wiring zu Beat-Sync und Ducking
- `src/components/audio-studio/MusicGeneratorPanel.tsx`: Prefill-Props ergänzen
- `supabase/config.toml`: Function-Eintrag für `auto-match-music-to-video`

### Out of Scope (für spätere Iteration)

- Audio-Reaktive Beat-Cuts (Video an Track anpassen statt umgekehrt)
- Multi-Variant-Generation (3 Vorschläge parallel)
- Stem-aware Generation (separate Drum-Spur passend zum Schnittrhythmus)
