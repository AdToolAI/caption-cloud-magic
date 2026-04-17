
## Befund
ElevenLabs gibt **404 voice_not_found** für `de5LFXQjQQGyAwjBLcVD` (Klaus) zurück. Diese ID existiert nicht im ElevenLabs-Katalog — sie wurde als Platzhalter eingetragen.

Betroffene fiktive IDs in `supabase/functions/_shared/premium-voices.ts`:
- `de5LFXQjQQGyAwjBLcVD` — "Klaus" (DE male) ❌
- `flHkNRp1BlvT73UL6gyz` — "Julia" (DE female) ❌
- `gD1IexrzCvsXPHUuT0s3` — "Mateo" (ES male) ❌
- `9oPKasc15pfAbMr7N6Gs` — "Lucía" (ES female) ❌

Die anderen DE/ES-Stimmen nutzen bereits **echte multilinguale ElevenLabs-IDs** (Matilda, Bill, Daniel, Eric, Jessica, Laura) mit deutschen/spanischen Anzeigenamen — das funktioniert mit `eleven_multilingual_v2` einwandfrei.

## Plan

### 1. Ungültige Voice-IDs durch echte ersetzen
In `supabase/functions/_shared/premium-voices.ts`:

**Deutsch:**
- "Klaus" (mature male, narrator) → `nPczCjzI2devNBz1zQrb` (Brian — tief, vertrauensvoll, perfekt für DE-Narration)
- "Julia" (adult female, narrator) → `EXAVITQu4vr4xnSDxMaL` (Sarah — warm, narratorisch)

**Spanisch:**
- "Mateo" (adult male) → `JBFqnCBsd6RMkjVDRZzb` (George — tiefer Erzähler)
- "Lucía" (adult female) → `FGY2WhTYpPnrIDTdsKH5` (Laura — klar, elegant)

Alle nutzen `eleven_multilingual_v2`, das DE und ES nativ unterstützt.

### 2. Frontend-Mirror prüfen
Falls `src/lib/elevenlabs-voices.ts` (oder ähnliche Liste) die IDs hartcodiert spiegelt, dort dieselben 4 IDs aktualisieren. Bestehende User-Drafts mit alter "Klaus"-ID (`de5LFXQjQQGyAwjBLcVD`) erhalten beim nächsten Generieren automatisch den neuen Brian-Klang ohne DB-Migration — aber wir brauchen einen **Fallback-Guard** in der Edge Function:

### 3. Fallback-Guard in `generate-voiceover/index.ts`
Bevor ElevenLabs gerufen wird: Wenn die übergebene `voiceId` **nicht** in `PREMIUM_VOICES` ist UND nicht dem ElevenLabs-Standard-Format entspricht (oder wir 404 bekommen), fallback auf eine bekannt gute ID je nach Sprache (`9BWtsMINqrJLrRacOk9x` Aria als universeller Default).

Konkret: Try/Catch um den ElevenLabs-Call → bei 404 retry mit Default-Voice + Log-Warnung. Das schützt auch alte Drafts, die noch die ungültigen IDs gespeichert haben.

## Geänderte Dateien
- `supabase/functions/_shared/premium-voices.ts` — 4 ungültige IDs ersetzen
- `supabase/functions/generate-voiceover/index.ts` — 404-Fallback-Retry mit Default-Voice

## Verify
- Stimme "Klaus" (DE) auswählen → Voiceover generiert erfolgreich
- "Julia" (DE), "Mateo" (ES), "Lucía" (ES) generieren erfolgreich
- Edge Function Logs zeigen keine 404 mehr
- Bei unbekannter Voice-ID: Fallback greift, kein Crash
