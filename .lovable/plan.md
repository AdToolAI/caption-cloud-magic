## Native Music Library — Plan

Wir bauen eine eigenständige Music-Studio-Page (`/music-studio`) und erweitern den bestehenden `MusicLibraryBrowser` um drei neue Quellen: **Suno** (KI-Songs mit Vocals), **Mubert** (loopbare adaptive Background-Music) und eine kuratierte **Lizenzierte Stock-Library** (Jamendo Pro + Pixabay, in eigene DB-Tabelle gesynct mit Lizenznachweis).

Das ergänzt nahtlos die existierende Generation (ElevenLabs Music + MusicGen, drei Tiers) und die Stock-Suche (Jamendo, Pixabay live).

### Neue Provider — Capability Matrix

| Provider | Stärke | Output | Preis-Tier | Use Case |
|---|---|---|---|---|
| **Suno v4** | Songs mit Lyrics + Vocals (Strophe/Refrain) | bis 4 min | €1.20/Track | Branded Anthems, Hooks, Werbe-Songs |
| **Mubert** | Adaptive loopbare Tracks, exakte Länge | beliebig | €0.40/Track | Background-Music, Podcasts, Vlogs |
| **Lizenzierte Library** | Pre-vetted Profi-Tracks mit Lizenz-PDF | fix | €0 (in Plan) | Production-safe ohne Generation |

### Page `/music-studio` — Aufbau

Ein Tab-System mit 4 Tabs, alle teilen denselben Player + "Use in Project"-Action:

1. **Generieren** — Bestehendes `MusicGeneratorPanel` + neue Provider-Auswahl (ElevenLabs / MusicGen / **Suno** / **Mubert**) als Segmented-Control. Für Suno: Lyrics-Editor + Style-Tags. Für Mubert: Mood-Palette + Loop-Toggle + exakte Sekunden.
2. **Lizenziert** — Browse-Grid für die kuratierte Stock-Library mit Filter (Genre, Mood, BPM, Duration). Jeder Track zeigt Lizenz-Badge ("Royalty-free, commercial OK").
3. **Stock-Suche** — Live Jamendo + Pixabay (existiert bereits, wird hier eingebettet).
4. **Meine Tracks** — Alle generierten + favorisierten Tracks des Users mit Re-Use, Download, Tag-System.

Top-Bar: Globaler Mood-Picker (Cinematic, Corporate, Upbeat, …), BPM-Filter, Search.

### Integration im bestehenden `MusicLibraryBrowser`

Neue Tabs werden hinzugefügt: `Generate (Suno/Mubert)`, `Licensed`. Bestehende Stock-Suche bleibt. So nutzbar in Director's Cut + Composer ohne Page-Wechsel.

### Datenmodell

Neue Tabelle `licensed_music_tracks` (admin-curated, public read):
- `id, title, artist, duration_sec, bpm, genre, mood[], tags[]`
- `audio_url` (Supabase Storage), `waveform_url` (optional)
- `license_type` ('cc-by', 'royalty-free', 'commercial'), `license_url`, `attribution_required`
- `category, is_featured, plays_count`

Bestehende Tabelle `background_music_tracks` bleibt unverändert (für die Auto-Match-Engine).

User-generierte Suno/Mubert-Tracks gehen in die existierende `generated_music_tracks`-Tabelle (nur neue Spalte `provider` extended um 'suno'/'mubert').

### Edge Functions (neu)

1. **`generate-suno-track`** — Suno API v4 (suno.ai oder via Replicate), erwartet `{ prompt, lyrics?, style, instrumental, durationSeconds }`. Background-Polling (3-5 min Generation-Zeit) via `EdgeRuntime.waitUntil`. Speichert in `generated_music_tracks` mit `provider:'suno'`. Credit-Refund bei Failure.
2. **`generate-mubert-track`** — Mubert API, erwartet `{ mood, genre, bpm, durationSeconds, loop }`. Synchron (~5-15s). Speichert analog.
3. **`seed-licensed-library`** — Admin-only Seeder, lädt kuratierte Tracks (initial ~50-100) aus Jamendo Pro + manuell uploads in den `licensed-music` Storage-Bucket und in die DB. Run-once, später iterativ erweiterbar.

Bestehende `generate-music-track` bleibt unverändert (ElevenLabs/MusicGen).

### API Keys benötigt

- **`SUNO_API_KEY`** — über sunoapi.org oder direkt suno.ai (Beta-Access)
- **`MUBERT_API_KEY`** — Pay-as-you-go via mubert.com/render-api
- Beide via `add_secret`-Flow nach User-Bestätigung.

### Storage

Neuer öffentlicher Bucket `licensed-music` (read-public, write-admin-only). Generated Tracks bleiben im existierenden `generated-music`-Bucket (user-scoped RLS).

### Pricing-Konfiguration (in `useMusicGeneration`)

```typescript
MUSIC_TIER_PRICING = {
  quick:    { eur: 0.10, engine: 'MusicGen' },
  standard: { eur: 0.35, engine: 'ElevenLabs Music' },
  pro:      { eur: 1.40, engine: 'ElevenLabs Music Pro' },
  mubert:   { eur: 0.40, engine: 'Mubert Adaptive' },     // NEW
  suno:     { eur: 1.20, engine: 'Suno v4 (with vocals)' }, // NEW
}
```

### Sidebar / Navigation

Neuer Eintrag "Music Studio" 🎵 unter Audio-Tools (oder als Top-Level neben "Audio Studio"). Genaue Position klären wir bei Implementierung am Live-Layout.

### UX-Highlights

- **Lyrics-Editor (Suno)**: Mehrzeiliger Editor mit `[Verse]`, `[Chorus]`, `[Bridge]` Section-Tags + KI-Lyrics-Generation-Button (Lovable AI)
- **Mubert Mood-Palette**: 12 Moods als visuelle Karten mit Mini-Wave-Preview
- **Beat-Sync ready**: Generierte Tracks werden auto-analysiert (BPM via existierende `analyze-music-bpm`) und können direkt in den Beat-Sync übergeben werden
- **Lizenz-Transparenz**: Jeder Track zeigt klar "AI-generated (Suno) — commercial use OK" oder "Licensed track — attribution required: …"

### Lokalisierung

Alle UI-Strings DE/EN/ES via `useTranslation`. Lyrics-Generation-Prompts respektieren `language`-State.

### Phasen

1. **Phase 1 (dieser Build):** Page-Skeleton `/music-studio` + Mubert-Integration + Sidebar + Erweiterung MusicLibraryBrowser um "Mubert"-Tab
2. **Phase 2:** Suno-Integration + Lyrics-Editor (separater Build wegen Suno-Beta-Onboarding)
3. **Phase 3:** Lizenzierte Library + Seeder + Admin-Upload-Tool (separater Build)

### Was geklärt werden muss vor Implementierung

- Bestätigung, ob wir Phase 1+2+3 in einem Big-Bang bauen oder schrittweise (empfehle schrittweise wegen Suno-Onboarding-Zeit)
- Suno-API-Quelle: offizielle Beta vs. sunoapi.org-Wrapper (letzteres sofort nutzbar)
