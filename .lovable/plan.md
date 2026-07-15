## Ziel

Alle Composer (Motion Studio, AI Video Studio, Universal Creator, Director's Cut, Voice Composer, Cast & World Charaktere) bekommen Zugriff auf die **volle ElevenLabs Voice Library (~5k+ Shared Voices)**, sauber pro Sprache gefiltert, mit hartem Ausschluss englischer Akzente in DE/ES.

## Diagnose

- `supabase/functions/list-voices` liefert aktuell **nur** die kuratierte `PREMIUM_VOICES`-Liste + die eigenen Workspace-Voices (`/v1/voices`). Die eigentliche **Shared Voice Library** von ElevenLabs (`/v1/shared-voices`, ~5k+ freigegebene Stimmen für unser Abo) wird nicht abgefragt.
- Sprach-Zuordnung nutzt zwar `verified_languages`, akzeptiert aber jede Stimme mit passendem `labels.language` — inkl. Voices die z.B. nur englischen Akzent auf Deutsch haben.
- `PREMIUM_VOICES` recycelt teilweise dieselbe `voice_id` für DE/ES (siehe list-voices L67-88 Kommentar: "Daniel = Markus/DE + Diego/ES"). Genau daher: englischer Akzent auf Deutsch.
- Es gibt bereits **eine** zentrale Fetch-Stelle (`list-voices`) — alle Picker (Motion Studio VoicePicker, Voice-Composer SpeakerMappingBar, AvatarVoicePicker, Universal Creator, Director's Cut) rufen sie an. Ein Backend-Fix trifft alle Composer gleichzeitig.

## Plan

### 1. Backend — Voice Library Expansion

**`list-voices` erweitern** (`supabase/functions/list-voices/index.ts`):
- Neuer Fetch gegen `GET https://api.elevenlabs.io/v1/shared-voices` mit Filtern:
  - `language=<de|en|es>` (nativ pro Anfrage)
  - `featured=true`, `category=professional`, `use_cases`, `gender`, `age`, `accent`
  - `page_size=100`, Pagination via `page`
- Ergebnisse zu einheitlichem `VoiceMeta`-Shape normalisieren (id, name, language, accent, gender, age, use_case, preview_url, tier=`community`, native=`true|false`, popularity_score).
- **Strict-Native-Filter:** Voice landet nur in einer Sprache wenn:
  - `verified_languages` enthält die Sprache **UND** entweder `accent` fehlt / ist `native` / matcht die Zielsprache.
  - Voices mit `labels.accent === 'american'|'british'|'australian'` werden in DE/ES rausgefiltert (opt-out via Flag `includeNonNative`).
- Neue Request-Params: `language`, `gender`, `age`, `accent`, `use_case`, `search`, `nativeOnly` (default `true` für de/es), `page`, `pageSize`, `sort` (popularity|newest|name).
- Response: `{ voices, hasMore, page, total, nativeCount }`.

**Cache-Tabelle** `voice_library_cache` (neue Migration):
- Spalten: `voice_id` PK, `name`, `language`, `accent`, `gender`, `age`, `use_case`, `preview_url`, `is_native` bool, `popularity` int, `tier` text, `updated_at`.
- RLS: `SELECT` für `authenticated`, keine Writes vom Client. GRANT auf `authenticated`.
- Refresh via neuer Edge Function `refresh-voice-library` (pg_cron alle 24h) → holt komplette Shared Library seitenweise, upsertet in Cache.
- `list-voices` liest primär aus Cache (schnell), fällt bei Cache-Miss/leer auf Live-API zurück.

**Config-Cleanup** (`_shared/premium-voices.ts`):
- Cross-Language-Recycling entfernen (Daniel=Markus/DE + Diego/ES etc.) — jede Sprache bekommt native `voice_id`s.
- Neues Feld `native: true` explizit setzen, damit UI sortieren kann.

### 2. Frontend — Universal Voice Library Picker

Neue Komponente **`src/components/voices/UniversalVoiceLibraryPicker.tsx`** ersetzt schrittweise:
- `src/components/motion-studio/VoicePicker.tsx`
- `src/components/video-composer/voice-studio/SpeakerMappingBar.tsx` (Voice-Auswahl-Teil)
- `src/components/brand-characters/AvatarVoicePicker.tsx`
- Voice-Slots in Universal Creator (`ContentVoiceStep`), Director's Cut (`VoiceOverStep`, `AIVoiceOver`), AI Video Studio Kling Omni omniLines.

**Features:**
- Filter-Bar (sticky): Sprache-Chip (DE/EN/ES + weitere über Popover), Geschlecht, Alter, Use-Case, "Nur native Speaker" Toggle (default ON für DE/ES), Search-Feld.
- Gruppen (Reihenfolge):
  1. **Meine Stimmen** (`custom_voices`)
  2. **Premium (kuratiert)** — native only
  3. **Community Library** — paginated, "Mehr laden"-Button
- Jede Zeile: Name · Akzent-Badge · Gender/Age · Use-Case · Preview-Button · Native-Häkchen.
- Debounced Search (300 ms), URL-State im Composer optional, letzte Filter pro Composer via localStorage gemerkt.

**Hook** `src/hooks/useVoiceLibrary.ts`:
- `useInfiniteQuery` mit Keys `[language, gender, accent, age, use_case, search, nativeOnly, sort]`.
- Cache 1h, prefetcht Preview-URLs.

### 3. Language-Hardening in bestehenden Voice-Konsumenten

- `resolveDialogVoice`, `autoVoiceAssignment`, `briefing-deep-parse` bekommen `nativeOnly=true` als Default → Auto-Assignment weist nie mehr einen EN-Akzent-Speaker für DE zu.
- `compose-twoshot-audio`, `generate-multi-speaker-vo`, `director-cut-voice-over`: validieren vor Synthese, dass gewählte `voice_id` in `voice_library_cache` mit passender Sprache existiert; sonst Fallback auf native Premium-Default der Sprache.

### 4. Rollout & Verifikation

1. Migration + Cache-Tabelle deployen.
2. `refresh-voice-library` einmal manuell triggern → Cache füllen.
3. `list-voices` deployen (neues API-Shape, alte Konsumenten weiter kompatibel, da `voices[]` gleich bleibt).
4. `UniversalVoiceLibraryPicker` bauen, zuerst in Motion Studio austauschen (kleinster Blast Radius), dann Voice Composer, dann Rest.
5. Playwright-Check: DE-Filter zeigt >100 native Voices, keine `accent: american` mehr.

## Technisches

**Neue/geänderte Dateien:**
- `supabase/functions/list-voices/index.ts` — Shared-Library-Fetch + strict language filter
- `supabase/functions/refresh-voice-library/index.ts` — NEU, pg_cron nightly
- `supabase/functions/_shared/premium-voices.ts` — native-only Cleanup
- `supabase/migrations/<ts>_voice_library_cache.sql` — Cache-Tabelle + GRANT + RLS + pg_cron
- `src/hooks/useVoiceLibrary.ts` — NEU (useInfiniteQuery)
- `src/components/voices/UniversalVoiceLibraryPicker.tsx` — NEU
- `src/lib/elevenlabs-voices.ts` — VoiceMeta um `native`, `accent`, `age`, `use_case`, `popularity`, `preview_url` erweitern
- Ersetzung in: `motion-studio/VoicePicker.tsx`, `video-composer/voice-studio/SpeakerMappingBar.tsx`, `brand-characters/AvatarVoicePicker.tsx`, `universal-creator/steps/ContentVoiceStep.tsx`, `directors-cut/steps/VoiceOverStep.tsx`, `directors-cut/features/AIVoiceOver.tsx`, `ai-video-studio/ToolkitGenerator.tsx` (Kling Omni omniLines)

**ElevenLabs API-Endpoints:**
- `GET /v1/shared-voices?page_size=100&language=de&featured=true&category=professional`
- `GET /v1/voices` (bestehend, für Workspace-Voices)

**Migrations-Skelett:**
```text
voice_library_cache
├── voice_id text PK
├── name, language, accent, gender, age, use_case
├── preview_url, is_native bool, popularity int, tier text
└── updated_at timestamptz default now()

GRANT SELECT ON public.voice_library_cache TO authenticated;
GRANT ALL   ON public.voice_library_cache TO service_role;
ALTER TABLE public.voice_library_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Voices sind für eingeloggte User lesbar"
  ON public.voice_library_cache FOR SELECT TO authenticated USING (true);
```

## Offen

- Soll der native-Filter für **EN** auch default ON sein (nur US/UK native) oder default OFF (mehr Auswahl)?
- Weitere Sprachen freischalten (FR/IT/PT/NL) sobald DE/ES/EN sauber laufen — soll ich das jetzt schon mit reinnehmen oder Phase 2?
