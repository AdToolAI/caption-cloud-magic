## Ziel
Sicherstellen, dass jede:r Sprecher:in **immer** eine Stimme bekommt – auch wenn das Briefing keine nennt und der Charakter (z.B. Samuel) keine `default_voice_id` hinterlegt hat.

## Status heute
- **Pass-B (Gemini)** in `briefing-deep-parse` versucht bereits, Stimmen zuzuordnen → schlägt aber still fehl, wenn Gemini eine UUID zurückgibt oder leer lässt.
- **`useApplyProductionPlan.ts`** fällt nur auf `brand_characters.default_voice_id` oder die Projekt-Voice zurück. Hat Samuel keine Default-Voice → `character_voice_id = NULL`.
- **`SceneDialogStudio.tsx`** zeigt dann "Stimme wählen", weil es nicht auf die im Plan vorgeschlagene Voice zurückgreift.

→ Resultat: ohne manuelle Brand-Default bleibt das Feld leer. Genau das war im letzten Run zu sehen.

## 4-Schritt-Fix

### 1. Deterministischer Auto-Voice-Pool (Client)
In `useApplyProductionPlan.ts` lokale Pools ergänzen:
- **Male:** Brian, Liam, George, Will, Eric, Chris
- **Female:** Sarah, Laura, Alice, Matilda, Lily, Jessica

Logik pro Sprecher (Reihenfolge):
1. `character_voice_id` aus Plan (sofern ElevenLabs-ID, keine UUID)
2. `brand_characters.default_voice_id`
3. **NEU:** Round-Robin aus Pool, gemappt auf `brand_characters.gender`
4. Projekt-Default

So ist `character_voice_id` **nie NULL**, sobald ein Sprecher existiert.

### 2. Gender-Mapping anreichern
`brand_characters.gender` mit in den Cast-Kontext laden, damit der Pool-Picker geschlechtsgerecht wählt (Samuel → male pool → Brian).

### 3. UI-Fallback in `SceneDialogStudio.tsx`
Wenn `defaultVoiceByCharId[charId]` leer ist, aber die Scene bereits eine `character_voice_id` trägt → diese binden und als "⚡ Auto" Badge anzeigen, statt "Stimme wählen".

### 4. Hydration-Fix in `VideoComposerDashboard.tsx`
Beim Laden aus DB sicherstellen, dass `character_voice_id` + `dialog_voices` (JSONB) korrekt in den `ComposerScene` State zurückgemappt werden – aktuell geht das beim Reload teilweise verloren.

## Server-Seite (bereits aktiv, nur verifizieren)
- Pass-B in `briefing-deep-parse` repariert UUID-Voices (Stage Patch v3 aus letztem Turn).
- Telemetrie loggt `null project_id` und `voice_assignment_source` (plan/brand/pool/project).

## Akzeptanzkriterium
Briefing ohne Voice-Angabe + Charakter ohne `default_voice_id`:
- Storyboard zeigt für jeden Sprecher eine konkrete Stimme (z.B. „Brian ⚡ AI") statt „Stimme wählen".
- DB-Row `composer_scenes.character_voice_id` enthält gültige ElevenLabs-ID.
- Up to 4 Sprecher pro Szene werden unterschiedlich (round-robin) versorgt.

## Nicht im Scope
- Keine Änderung an Hailuo/Sync.so Pipelines.
- Keine UI-Redesigns der Voice-Picker, nur Default-Binding + Badge.
