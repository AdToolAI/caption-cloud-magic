

## Plan: Videoübersetzer (Video Translator)

### Was gebaut wird

Eine neue Seite "Videoübersetzer", auf der Nutzer ein Video hochladen können. Die KI erkennt automatisch die gesprochene Sprache, transkribiert den Inhalt, übersetzt ihn in die Zielsprache und generiert ein neues synchronisiertes Voiceover. Das Ergebnis ist ein Video mit dem neuen Voiceover und optionalen Untertiteln.

### Ablauf für den Nutzer

```text
┌──────────────────────────────────────────┐
│  1. Video hochladen / URL eingeben       │
│  2. KI erkennt Sprache automatisch       │
│  3. Zielsprache wählen (DE, EN, ES, ...) │
│  4. Optional: Stimme wählen              │
│  5. "Übersetzen" klicken                 │
│  6. Fortschrittsanzeige (5 Schritte)     │
│  7. Ergebnis: Video + Untertitel         │
└──────────────────────────────────────────┘
```

### Pipeline (Edge Function)

Die neue Edge Function `translate-video` orchestriert 5 Schritte:

1. **Audio extrahieren** — Video-URL laden, Audio via ffmpeg (oder vorhandene Infrastruktur) isolieren und in Storage hochladen
2. **Transkribieren** — ElevenLabs Speech-to-Text (`scribe_v2`) mit automatischer Spracherkennung (kein `language_code` → Auto-Detect)
3. **Übersetzen** — Lovable AI übersetzt den transkribierten Text absatzweise in die Zielsprache, mit Timing-Kontext für natürliche Pausen
4. **Voiceover generieren** — ElevenLabs TTS generiert das übersetzte Voiceover; Speed-Parameter wird angepasst, damit die Dauer ungefähr dem Original-Segment entspricht
5. **Video zusammensetzen** — Original-Video (stumm) + neues Voiceover-Audio werden per Remotion oder ffmpeg kombiniert. Optional: übersetzte Untertitel einbrennen

### Datenbank

Neue Tabelle `video_translations`:

| Spalte | Typ | Beschreibung |
|--------|-----|-------------|
| id | uuid | PK |
| user_id | uuid | FK auth.users |
| source_video_url | text | Original-Video |
| source_language | text | Erkannte Sprache |
| target_language | text | Zielsprache |
| original_transcript | text | Originaltext |
| translated_transcript | text | Übersetzter Text |
| voiceover_url | text | Neues Voiceover |
| output_video_url | text | Fertiges Video |
| status | text | pending/transcribing/translating/generating/rendering/completed/failed |
| metadata | jsonb | Zusätzliche Infos (Dauer, Segmente) |
| created_at | timestamptz | |

RLS: Nutzer sehen nur eigene Einträge.

### Frontend-Komponenten

**1. Neue Seite `src/pages/VideoTranslator.tsx`**
- Hero-Header mit Beschreibung
- Upload-Zone (Drag & Drop oder URL)
- Sprachauswahl (Zielsprache) + optionale Voice-Auswahl
- Fortschrittsanzeige mit 5 Schritten und Status-Updates
- Ergebnis-Bereich: Video-Player, Untertitel-Download, Audio-Download

**2. Hook `src/hooks/useVideoTranslation.ts`**
- State-Management für den gesamten Übersetzungsprozess
- Polling für Status-Updates
- Error-Handling

**3. Route**
- `/video-translator` → VideoTranslator-Seite
- Navigation in Sidebar unter "Video Tools" oder "KI Tools"

### Edge Function: `translate-video`

```text
Request:
  video_url: string
  target_language: string  (z.B. "de", "en", "es")
  voice_id?: string        (ElevenLabs Voice)
  include_subtitles?: boolean

Response:
  translation_id: string
  status: string

→ Verarbeitung asynchron, Status-Polling über DB
```

Intern nutzt die Funktion:
- ElevenLabs STT (Transkription + Spracherkennung) — `ELEVENLABS_API_KEY` vorhanden
- Lovable AI (Übersetzung) — `LOVABLE_API_KEY` vorhanden
- ElevenLabs TTS (Voiceover) — bereits vorhanden
- Video-Rendering via bestehende Remotion-Infrastruktur oder ffmpeg

### Synchronisations-Strategie

Um das Voiceover synchron zum Original zu halten:
- Die Transkription liefert Wort-Timestamps
- Übersetzung erfolgt segmentweise (Satz für Satz)
- Für jedes Segment wird die TTS-Speed angepasst, damit die generierte Audio-Dauer der Original-Segment-Dauer entspricht (ElevenLabs `speed` Parameter: 0.7–1.2)
- Segmente werden mit korrektem Timing zusammengefügt

### Betroffene Dateien

1. **Migration** — Neue Tabelle `video_translations` + RLS
2. `supabase/functions/translate-video/index.ts` — Hauptlogik
3. `src/pages/VideoTranslator.tsx` — UI-Seite
4. `src/hooks/useVideoTranslation.ts` — Hook
5. `src/App.tsx` — Route hinzufügen
6. Navigation/Sidebar — Link hinzufügen

### Einschränkungen

- ElevenLabs Speed-Range ist 0.7–1.2x — bei sehr langen/kurzen Übersetzungen kann es leichte Abweichungen geben
- Erste Version ohne Lippensynchronisation (nur Audio-Ersetzung)
- Video-Rendering kann je nach Länge 1–5 Minuten dauern

