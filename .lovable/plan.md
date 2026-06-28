## Plan: Auto-Voice-Assignment für Cast-Mitglieder

### Problem
Aktuell: Wenn ein Brand-Character keine `default_voice_id` hat (z.B. Samuel), bleibt `character_voice_id = NULL` und der User muss im Audio-Sheet manuell eine Stimme wählen.

Ursache: In `briefing-deep-parse` (Pass B) wird laut Prompt nur die **Character-Default** kopiert (Zeile 487: *"copy default_voice_id from the matched brand_character into ResolvedCast.voiceId, or null if missing"*). Der Resolver darf also keine Stimme aus dem Katalog wählen, wenn der Character keine hat.

### Lösung — KI wählt selbst eine passende Stimme
Den Resolver befähigen, für **bis zu 4 Sprecher** eine passende ElevenLabs-Stimme aus dem 14-Voice-Katalog (`voices` array, Zeile 1001–1016) zuzuordnen, basierend auf:
- **Sprache des Briefings** (LANGUAGE_LOCK, z.B. DE)
- **Charakter-Metadaten**: `gender`, `age`, `persona_description` aus `brand_characters`
- **Tonality** der Szene (z.B. "energisch" → Brian/Liam, "warm" → Sarah/Laura)
- **Deduplication**: keine Stimme zweimal innerhalb einer Szene (Multi-Speaker)

### Konkrete Änderungen

**1. `supabase/functions/briefing-deep-parse/index.ts`**

a) **Library-Query erweitern** (Zeile 925): zusätzlich `gender, age, persona_description` aus `brand_characters` laden und in das LIBRARY-Payload für Pass B mitgeben.

b) **System-Prompt Pass B** (Zeile 485–487) ersetzen durch:
```
For voice resolution:
- Project-level voice: if briefing names a voice (id OR name), resolve via LIBRARY.voices.
- Per-cast voice resolution (priority order):
  1. brand_character.default_voice_id (if set)
  2. AUTO-MATCH from LIBRARY.voices using:
     - briefing language (OUTPUT_LANGUAGE)
     - character.gender / age / persona_description
     - scene tonality (energetic/warm/calm/authoritative)
  3. Within a single scene with multiple speakers, NEVER assign the same voiceId twice.
- For every auto-matched voice, add an "aiFilled" entry: cast.<characterId>.voiceId
- Voice catalog hints (gender):
  Male: George, Roger, Charlie, Liam, Eric, Chris, Brian, Daniel, Bill
  Female: Alice, Sarah, Laura, Matilda, Lily
```

c) **Lokaler Fallback** (Zeile 1050 ff.): heuristisches Auto-Match — wenn `default_voice_id` fehlt, deterministische Auswahl per `character.gender` (♂ → Brian, ♀ → Sarah) + Round-Robin bei Multi-Cast.

**2. `src/hooks/useApplyProductionPlan.ts`**

`cleanVoiceId` Map um die jetzt vom Resolver gefüllten echten Voice-IDs ergänzen → bestehender Code übernimmt sie automatisch.

**3. UI-Anzeige (`ProductionPlanSheet.tsx`)**

Bei auto-zugewiesenen Stimmen einen ⚡ "AI-gewählt"-Badge neben dem Voice-Chip anzeigen (analog zu den existierenden 3-State-Chips für AI-Fill).

### Was NICHT angefasst wird
- Lipsync-Pipeline, Sync.so, HappyHorse-Green-Net, Pricing
- `default_voice_id` in `brand_characters` wird **nicht** persistent überschrieben — Auto-Match gilt nur für diesen Plan. Optional späterer "Als Standard speichern"-Button im Avatar-Detail.

### Aufwand
1 Edge Function + 1 Hook + 1 UI-Komponente, ~60 Zeilen Diff. Kein neuer API-Call, nutzt bereits laufenden Pass-B Gemini-Call.

### Verifikation
1. Briefing mit Samuel (kein default_voice_id) analysieren.
2. `composer_scenes.character_voice_id` ist gesetzt (z.B. `nPczCjzI2devNBz1zQrb` Brian für männlichen DE-Sprecher).
3. Multi-Speaker-Szene (2 Sprecher) → zwei **unterschiedliche** Voice-IDs.
4. Im Plan-Sheet steht ⚡ "AI-gewählt" neben der Stimme.