## Problem

Music Studio generation with **ElevenLabs Music v2** fails with Replicate `422 Unprocessable Entity`:

```
input.output_format: output_format must be one of
"mp3_standard", "mp3_high_quality", "wav_16khz",
"wav_22khz", "wav_24khz", "wav_cd_quality"
```

`supabase/functions/generate-music-track/index.ts:229` sends `output_format: 'mp3_44100_128'` (an ElevenLabs-native format string), but the Replicate wrapper for `elevenlabs/music` accepts a different enum.

## Fix

Change line 229 in `supabase/functions/generate-music-track/index.ts`:

```diff
- output_format: 'mp3_44100_128',
+ output_format: 'mp3_high_quality',
```

That's the only change. Other engines (stable-audio line 204 uses `'mp3'`, which is valid for that model) stay untouched.

## Verify

After deploy, retry the same track ("Electric Music Tomorrowland..."). Edge log should show `INFO engine=elevenlabs-music-v2` followed by a successful prediction instead of the 422.
