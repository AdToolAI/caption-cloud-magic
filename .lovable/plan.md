## Problem

`generate-voiceover-hume` failed with `404 Octave shared voice with name "Zara" not found`. Our curated `HUME_VOICES` list in `src/lib/voice-studio/humeVoices.ts` contains made-up names (Zara, Aura, Nova, Rhys, Lucas) that do not exist in Hume's public Voice Library. Only a few (Ito, Kora, Dacher) happen to be real.

Hardcoding names will keep breaking — Hume's library changes and we can't guess it.

## Fix

Replace the hardcoded list with the **live Hume Voice Library**, fetched once and cached.

### 1. New edge function `list-voices-hume`
- Calls `GET https://api.hume.ai/v0/tts/voices?provider=HUME_AI` (paginated, follow `next_page_token`).
- Returns `{ voices: [{ id, name, provider: 'HUME_AI' }] }`.
- Auth: standard JWT check (same as `generate-voiceover-hume`).
- CORS: standard.

### 2. Replace `humeVoices.ts` with a hook
- New hook `src/hooks/useHumeVoices.ts` using React Query (`staleTime: 1h`) that calls `list-voices-hume`.
- Returns `HumeVoiceMeta[]` shaped like before (`id` = `hume:<name>`, `name`, `provider`, `label`, `description`, `gender: 'neutral'`, `languages: ['en','de','es']`).
- Keep `getHumeVoiceById` / `isHumeVoiceId` helpers but rewrite as pure functions over a passed-in list (or read from React Query cache).
- Delete the hardcoded `HUME_VOICES` array.

### 3. Wire the hook into the two consumers
- `SceneDialogStudio.tsx` — replace `import { HUME_VOICES }` with `useHumeVoices()`. Show a small spinner in the voice dropdown while loading; if fetch fails, fall back to a tiny safe list (`Ito`, `Kora`, `Dacher`) so the UI still works.
- `SpeakerMappingBar.tsx` — same swap.

### 4. Defensive server-side check
In `generate-voiceover-hume` and `preview-voice-hume`: if Hume returns 404 for the voice name, return a clean error `{ error: 'Voice "<name>" no longer exists in your Hume library. Please pick another voice.' }` instead of the raw Hume payload, so the toast is actionable.

### 5. No DB changes, no secrets changes
`HUME_API_KEY` already configured. No migration needed.

## Files

- **New**: `supabase/functions/list-voices-hume/index.ts`
- **New**: `src/hooks/useHumeVoices.ts`
- **Edit**: `src/lib/voice-studio/humeVoices.ts` (drop hardcoded list, keep types + helpers)
- **Edit**: `src/components/video-composer/SceneDialogStudio.tsx`
- **Edit**: `src/components/video-composer/voice-studio/SpeakerMappingBar.tsx`
- **Edit**: `supabase/functions/generate-voiceover-hume/index.ts` (friendlier 404 message)
- **Edit**: `supabase/functions/preview-voice-hume/index.ts` (friendlier 404 message)

## Result

The Hume voice picker shows **only voices that actually exist** in your Hume account / the public HUME_AI library, so "Voiceover generieren" can no longer fail with "voice not found".
