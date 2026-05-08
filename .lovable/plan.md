## Voice Studio 2.0 — Multi-Speaker, Hume Octave & Artlist-Niveau Kontrolle

Wir bauen den Voiceover-Step im Video Composer (Tab 4) zu einem vollwertigen "Voice Studio" um — drei Probleme werden parallel gelöst:

1. **Multi-Voice mit Speaker-Tags** — Skripte wie `Matthew: ...` / `Sarah: ...` werden segmentweise mit unterschiedlichen Stimmen synthetisiert und nahtlos zu einer einzigen VO-Spur zusammengefügt.
2. **Hume Octave als zweite TTS-Engine** — emotional natürlichste KI-Stimme am Markt, frei wählbar pro Segment neben ElevenLabs.
3. **Artlist-Niveau Kontrolle** — Inline-Tags (Pause/Emotion/Betonung), Pro-Satz-Tuning-Panel und Drag-to-Scene Timeline.

---

### Stage 1 — Multi-Speaker Skript-Engine

**Skript-Parser**
- Neuer Parser `lib/voice-studio/parseSpeakerScript.ts` erkennt Zeilen wie `Matthew: Hallo` / `**Sarah:** Hi` / `[Matthew] Hallo`
- Output: `[{ speaker: 'Matthew', text: '...', lineIndex: 0 }, ...]`
- Ohne Speaker-Tags → eine Zeile mit `speaker: 'Narrator'` (Backwards-compat)

**Voice-Mapping UI** (neuer Block oben im Voiceover-Tab)
- Erkannte Sprecher werden automatisch als Chips angezeigt
- Pro Sprecher Dropdown: Engine (ElevenLabs / Hume) + konkrete Stimme + Geschlecht-Filter
- Auto-Suggestion: erkennt Männer-/Frauen-Namen und schlägt passende Stimmen vor
- Persistenz: `assemblyConfig.voiceover.speakerMap = { Matthew: { engine, voiceId, settings }, Sarah: {...} }`

**Multi-Segment Generation**
- Neue Edge Function `generate-multi-speaker-vo`:
  - Iteriert über Segmente, ruft pro Segment richtige Engine auf
  - Stitcht alle MP3s sample-genau via WAV-Padding zu einer Spur
  - Optional: kleine Pause zwischen Sprecherwechseln (default 0.3s, einstellbar)
- Returnt eine WAV-URL + Wort-Timing-Array für Untertitel
- Idempotenter Credit-Refund bei Failures (gemäss Core-Memory)

```text
Skript: "Matthew: Schau die Drohne. Sarah: Wow!"
        │
        ├─ Segment 1 (Matthew) → ElevenLabs Liam → mp3
        ├─ 0.3s Pause
        └─ Segment 2 (Sarah)  → Hume Octave   → mp3
        │
        └─ Stitch → WAV mit Wort-Timestamps → upload
```

---

### Stage 2 — Hume Octave Integration

**Connector-Setup**
- Hume nutzt direkten API-Key (kein Connector-Gateway-Eintrag vorhanden) → `HUME_API_KEY` als Lovable Secret
- Wird bei Implementation via `add_secret` angefragt — User holt Key auf hume.ai → Settings → API Keys

**Edge Function `tts-hume`**
- Wrapper um Hume Octave TTS (Endpoint `/v0/tts/file`)
- Parameter: `text`, `voiceName`, `description` (Tonality-Prompt!), `speed`
- Response: MP3-Bytes → WAV-Konvertierung wie bei ElevenLabs

**Hume-Voice-Library**
- `lib/voice-studio/humeVoices.ts` mit ~12 kuratierten Hume-Voices (3 pro Sprache + Hume Voice Library Picks)
- Voice-Picker zeigt Tabs `ElevenLabs (XX)` / `Hume Octave (12)`
- Hume-Voices haben Badge "🎭 Octave" mit Tooltip "Emotional natürlichste Engine"

**Engine-Toggle pro Sprecher**
- Im Speaker-Mapping Dropdown: oben "Engine wählen" → ElevenLabs | Hume
- Voice-Liste filtert sich entsprechend

---

### Stage 3 — Artlist-Niveau Kontrolle

**3a. Inline-Tags im Skript-Editor**
- Toolbar über dem Textarea: Buttons für Pause / Whisper / Excited / Calm / Emphasize
- Klick fügt Tag an Cursor-Position ein: `[pause 0.5s]`, `[whisper]...[/whisper]`, `[excited]...[/excited]`
- Syntax-Highlighting im Textarea (eigene Mini-Implementation mit overlaid div)
- Beim Render werden Tags engine-spezifisch übersetzt:
  - **ElevenLabs v3** (wir upgraden default model auf `eleven_v3` für Tags-Support): native audio tags
  - **Hume Octave**: `description`-Feld wird mit der Emotion gefüllt (z.B. "whisper softly")
  - **ElevenLabs v2** (Fallback): `[pause]` → SSML-Komma-Tricks, Emotion → `style`-Slider hochregeln

**3b. Pro-Satz Voice-Tuning Panel**
- Skript-Editor zeigt rechts daneben eine Liste aller geparsten Sätze als Cards
- Jede Card: Sprecher-Badge, Text-Preview, "Re-roll"-Button (regeneriert nur diesen Satz)
- Expand → Slider: Stability, Style, Speed, Pitch (engine-abhängig sichtbar)
- Settings werden auf `segment.overrides` persistiert → bei Generation gemerged mit Speaker-Default
- Audio-Player pro Card mit ▶/⏸ und Wellenform

**3c. Timeline-VO mit Drag-to-Scene**
- Unterhalb des Skript-Editors: horizontaler Stripe mit Szenen (oben) und VO-Segmenten (unten)
- Jedes generierte Segment = farbiger Block (Farbe = Sprecher)
- Drag-to-Scene: Block über Szene ziehen → snapped an Scene-Start
- Manuelles Verschieben innerhalb der Timeline (Snap auf 0.1s)
- Visueller Sync-Marker zeigt: ✓ wenn VO-Segment-Mitte in Szene liegt, ⚠ wenn überlappt
- Gesamt-VO-Länge vs. Gesamt-Szenen-Länge oben rechts mit Status-Badge

---

### Stage 4 — Datenmodell & Persistenz

**Erweiterung `assemblyConfig.voiceover`** (TypeScript-Interface in `types/video-composer.ts`):
```text
voiceover: {
  enabled, script, audioUrl, durationSeconds,        // bestehend
  speakerMap: Record<string, SpeakerConfig>,         // NEU
  segments: VoiceSegment[],                          // NEU (geparste & gerenderte Sätze)
  defaultEngine: 'elevenlabs' | 'hume',              // NEU
  segmentGapMs: number,                              // NEU (default 300)
}
```

`VoiceSegment`:
```text
{
  id, speaker, text, lineIndex,
  audioUrl?, durationSeconds?,
  sceneAssignment?: string,    // sceneId für Drag-to-Scene
  startOffsetMs?: number,      // manuelle Verschiebung in Timeline
  overrides?: { stability, style, speed, pitch },
  status: 'pending' | 'generating' | 'ready' | 'failed'
}
```

Migration: `composer_projects.assembly_config` ist `jsonb` → keine Schema-Änderung nötig, nur TS-Types & Default-Initializer.

---

### Stage 5 — UI-Restrukturierung

Der bisherige `VoiceSubtitlesTab` wird in zwei Sub-Tabs geteilt:
- **Voice Studio** (neu, default) — Skript + Speaker-Map + Pro-Satz-Cards + Timeline
- **Untertitel** — bestehende Subtitle-Logik

Neue Komponenten unter `src/components/video-composer/voice-studio/`:
- `VoiceStudioPanel.tsx` (Container)
- `SpeakerMappingBar.tsx`
- `ScriptEditorWithTags.tsx`
- `SegmentCardList.tsx`
- `VoiceTimelineStripe.tsx`
- `EngineVoicePicker.tsx` (kombiniert ElevenLabs + Hume)

---

### Technische Details

**Edge Functions (neu)**
- `supabase/functions/generate-multi-speaker-vo/index.ts` — Orchestrator
- `supabase/functions/tts-hume/index.ts` — Hume Octave Wrapper
- Bestehende `generate-voiceover` bekommt optional `model_id: 'eleven_v3'`

**Secrets benötigt**
- `HUME_API_KEY` (wird via add_secret nach User-Zustimmung angefragt)

**Audio-Stitching**
- Erweitert `lib/audioToWav.ts` um `concatWavSegments(segments, gapMs)`
- Sample-genau via Web Audio API decode → AudioBuffer concat → WAV-encode
- Wort-Timestamps werden pro Segment offset-korrigiert

**Backwards-Compat**
- Alte Projekte ohne `speakerMap` → automatisch ein "Narrator" mit aktueller `voiceId` gemappt
- Skripte ohne Speaker-Tags → wie bisher single-voice
- `audioUrl` bleibt das finale Master-Asset (für Renderer transparent)

**Error-Handling**
- Pro-Segment Refund bei Engine-Failure
- Wenn Hume failt → Auto-Fallback Toast "Hume nicht erreichbar, Sarah-ElevenLabs verwendet" mit Retry-Button
- Validation: warnt wenn Speaker im Skript ohne Mapping (z.B. `Tom: Hi` aber kein Tom in Map)

---

### Out of Scope (bewusst weggelassen)
- Voice-Cloning für Hume (später)
- Automatisches Lip-Sync mit den neuen Multi-Voice Tracks (Composer-Lip-Sync-Toggle bleibt unverändert; nutzt finale Master-WAV)
- Music/SFX im selben Tab (bleibt im Audio-Tab)
- Realtime-Collaboration auf Voice-Editor (bestehende Composer-Collab greift global)

---

### Reihenfolge der Implementation

```text
1. Datenmodell + Skript-Parser (kein UI)         ~ kleine Iteration
2. Multi-Speaker ElevenLabs (ohne Hume)          ~ erste sichtbare Verbesserung
3. Hume-Integration (Secret + Edge + Picker)     ~ Roboter-Sound gelöst
4. Inline-Tags + ElevenLabs v3 Upgrade           ~ Tags funktional
5. Pro-Satz-Cards (Re-roll, Sliders)             ~ Detailkontrolle
6. Timeline + Drag-to-Scene                      ~ Sync-Kontrolle
```

Jede Stufe ist deploybar und testbar — du kannst nach Stage 2 schon zwei Sprecher hören, Stage 3 löst die Roboterstimme, Stage 4–6 bringen die Artlist-Tiefe.