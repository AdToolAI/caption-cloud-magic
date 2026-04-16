

## Befund
Aktuelle Situation in den 3 Modulen:

**Director's Cut** (`AIVoiceOver.tsx` + `director-cut-voice-over`):
- Hartkodierte Liste mit 6 DE / 6 EN Stimmen
- Nutzt `eleven_multilingual_v2` (älteres Modell)
- Voice Settings: `stability 0.5`, `similarity_boost 0.75`, kein `style`, kein `use_speaker_boost` → klingt flach/roboterhaft
- "Deutsche" Stimmen sind eigentlich englische Stimmen mit multilingual-Modell → Akzent-Probleme

**Universal Content Creator** (`ContentVoiceStep.tsx` + `generate-voiceover`):
- ✅ Lädt bereits dynamisch alle Stimmen via `list-voices`
- ❌ Aber: Sprach-Erkennung filtert nur grob; viele echte deutsche Stimmen (Multilingual v2 + v3) werden als "en" eingestuft
- Voice Settings ebenfalls flach

**Motion Studio / Video Composer** (`AudioTab.tsx`):
- Hartkodierte Mini-Liste mit 7 Stimmen, davon nur 1 als "DE" markiert (Daniel)
- Nutzt `generate-voiceover` mit Defaults

**Kernproblem**: ElevenLabs hat seit Mitte 2024 deutlich bessere deutsche Stimmen über die **Voice Library** (community + premade) und das neue **`eleven_v3`** Modell sowie verbessertes `eleven_multilingual_v2` mit `style`-Parameter. Diese werden derzeit nicht genutzt.

## Plan — Premium-Stimmen + besseres Modell überall

### 1. Kuratierte Premium-Voice-Library (zentral)
Neue Datei `src/lib/elevenlabs-voices.ts` mit einer kuratierten Liste **echter, hochwertiger Stimmen** pro Sprache (DE/EN/ES) — direkt aus der ElevenLabs Voice Library, jeweils mit:
- `voice_id`, `name`, `gender`, `age`, `description`
- `recommended_model`: `eleven_v3` für DE (beste deutsche Aussprache) bzw. `eleven_multilingual_v2`
- `recommended_settings`: stability/similarity/style/speaker_boost je nach Voice
- `tier`: `premium` (Library, premade)

Beispiele für **echte deutsche Premium-Stimmen** (öffentlich aus EL Voice Library):
- **Klaus** (deutscher Erzähler, männlich, warm) — `eleven_v3`
- **Julia** (deutsche weibliche Erzählerin) — `eleven_v3`
- **Markus** (deutscher Werbesprecher) — `eleven_multilingual_v2`
- **Hannah** (jung, freundlich, deutsch)
- **Stefan** (tief, autoritär, deutsch)
- **Lena** (warm, sympathisch, deutsch)

→ 6–8 echte deutsche Stimmen + 6–8 englische + 4 spanische. Diese Liste ist **die Single Source of Truth** für alle 3 Module.

### 2. Edge-Function `list-voices` aufwerten
Statt nur die Account-eigenen Voices zu listen, **die kuratierte Premium-Liste mit der ElevenLabs-Library mergen**:
- API-Call an `/v1/voices` für eigene Voices
- Kuratierte Liste aus `elevenlabs-voices.ts` (geteilt via `_shared/voices.ts` in supabase functions) wird als statische Premium-Voices vorangestellt
- Sprach-Filter funktioniert sauber, da `language` direkt aus der kuratierten Liste kommt
- Response enthält neu: `tier`, `recommended_model`, `recommended_settings`

### 3. Bessere Voice-Settings & neues Modell überall
Alle drei TTS-Edge-Functions (`generate-voiceover`, `director-cut-voice-over`, `generate-video-voiceover`) so anpassen, dass:
- Standard-Modell wechselt von `eleven_multilingual_v2` auf **`eleven_v3`** (für deutsche Stimmen) bzw. `eleven_turbo_v2_5` (für Echtzeit-Preview)
- Voice-Settings akzeptieren optional `style` (0–1) und `use_speaker_boost: true`
- Default-Settings für natürlicheren Klang: `stability 0.4` (statt 0.5, mehr Expression), `similarity_boost 0.8`, `style 0.3`, `use_speaker_boost true`
- Falls vom Frontend `recommended_settings` mitgegeben → diese verwenden
- Backwards-compatible: alte Voice-IDs funktionieren weiter

### 4. UI-Updates in allen drei Modulen
**Director's Cut (`AIVoiceOver.tsx`)**:
- Hartkodierte `GERMAN_VOICES`/`ENGLISH_VOICES` ersetzen → dynamisch via `list-voices` laden
- Tabs DE / EN / ES (neu)
- Pro Voice: Badge "Premium" + kurze Beschreibung
- Optional: Mini-Preview-Button pro Voice (5s Sample via `preview-voice`)

**Universal Content Creator (`ContentVoiceStep.tsx`)**:
- Bereits dynamisch — nur Sortierung anpassen: Premium-Voices zuerst, dann eigene
- Premium-Badge anzeigen
- Recommended-Settings beim Auswählen automatisch übernehmen

**Motion Studio (`AudioTab.tsx`)**:
- Hartkodierte `VOICES`-Liste durch dynamischen Load via `list-voices` ersetzen
- Sprach-Tabs DE/EN/ES
- Gleiche Premium-Sortierung

### 5. Hinweis-Banner & Lokalisierung
Kleiner Info-Banner in jedem Voice-Picker:
> "💡 Premium-Stimmen klingen am natürlichsten. Tipp: Nutze Satzzeichen für realistische Pausen."

DE/EN/ES inline (gleiches Pattern wie zuletzt).

## Geänderte / Neue Dateien
**Neu**:
- `supabase/functions/_shared/premium-voices.ts` — kuratierte Premium-Voice-Liste (Single Source of Truth)
- `src/lib/elevenlabs-voices.ts` — Frontend-Spiegelung für Typen/Defaults

**Bearbeitet**:
- `supabase/functions/list-voices/index.ts` — merged Premium-Liste mit API-Voices, gibt `tier`/`recommended_model`/`recommended_settings` zurück
- `supabase/functions/generate-voiceover/index.ts` — neues Standardmodell `eleven_v3`, neue Settings inkl. `style`/`use_speaker_boost`
- `supabase/functions/director-cut-voice-over/index.ts` — gleiche Aufwertung, akzeptiert beliebige voice_ids (nicht nur Mapping)
- `supabase/functions/generate-video-voiceover/index.ts` — gleiche Aufwertung
- `src/components/directors-cut/features/AIVoiceOver.tsx` — dynamisches Voice-Loading mit Tabs DE/EN/ES + Premium-Badges
- `src/components/video-composer/AudioTab.tsx` — dynamisches Voice-Loading mit Tabs + Premium-Badges
- `src/components/universal-creator/steps/ContentVoiceStep.tsx` — Premium-Sortierung + Badge

## Verify
- Director's Cut → Voice-Tab zeigt 6+ echte deutsche Stimmen (Klaus, Julia, Markus, …) mit Premium-Badge
- Generierter Voice-Over auf Deutsch klingt natürlich, kein US-Akzent, weniger roboterhaft
- Universal Creator → deutsche Tab zeigt Premium-Stimmen ganz oben
- Motion Studio → Sprach-Tabs DE/EN/ES funktionieren, Premium-Stimmen sichtbar
- Bestehende Voice-Over-URLs/Projekte unverändert (backwards-compatible)

## Was unverändert bleibt
- DB-Schema, Mediathek, Render-Pipeline, Pricing, andere Studios

