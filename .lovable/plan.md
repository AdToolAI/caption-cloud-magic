## Mini-Patch: Voice-Resolver + Cast-Dedup + Telemetrie

Der letzte Run (Projekt `779aeb60…`) hat den Briefing-Plan **korrekt** ins Storyboard übertragen — Prompt, Drehbuch, Cast, Dauer und Provider sind sauber in `composer_scenes`. Nur drei kleine Restlücken bleiben offen. Dieser Patch schließt sie gezielt, ohne den Rest der Pipeline anzufassen.

---

### 1. Voice-Resolver härten — Character-UUID → echte ElevenLabs-Voice

**Problem:** Der Plan setzt `voiceId = "483f9cdc-eb31-4486-bf67-9c5e7d955016"` — das ist die **Character-UUID**, keine ElevenLabs-Voice-ID. Folge: gelbe "voices unresolved"-Warnung im Plan-Sheet und `character_voice_id = NULL` in allen 3 Szenen → User muss Voice manuell wählen.

**Fix in `src/hooks/useApplyProductionPlan.ts`:**
- `cleanVoiceId(rawVoiceId, characters)` erweitern:
  - Wenn `rawVoiceId` in `brand_characters.id` existiert → `default_voice_id` dieses Characters zurückgeben.
  - Wenn das Ergebnis immer noch leer/keine echte Voice-ID-Form (`/^[a-zA-Z0-9]{15,30}$/`) → `null` + Warning ins Result-Panel.
- Beim Insert: `character_voice_id` nur setzen wenn aufgelöst, sonst `null` lassen (kein Engine-Token).

**Fix in `supabase/functions/briefing-deep-parse/index.ts`:**
- Im Pass-B-Resolver (Cast → Voice): wenn Gemini für `characterVoiceId` nur eine Character-UUID zurückgibt, in der `brand_characters`-Library nach `default_voice_id` für diesen Character schauen und damit ersetzen, bevor der Plan persistiert wird.

---

### 2. Cast-Dedup nach Insert

**Problem:** Szene 1 enthält `character_shots: [{characterId: "483f9cdc…"}, {characterId: "samuel-dusatko"}]` — zwei Slots für **dieselbe Person** (Library-UUID vs. Legacy-Slug). Triggert Multi-Portrait-Logik und kostet einen Slot.

**Fix in `src/hooks/useApplyProductionPlan.ts`:**
- Vor dem `insert`: `character_shots` über `resolveCharacterId()` (gibt es bereits in `src/lib/video-composer/resolveCharacterId.ts`) auf canonical IDs mappen und nach `characterId` deduppen — erstes Vorkommen gewinnt, `shotType` des spezifischeren Slots (`detail` > `full` > `absent`) wird bevorzugt.

---

### 3. Telemetrie-Log für künftige NULL-projectId Diagnose

**Problem:** Plans aus 19:43 und 20:01 hatten noch `project_id = NULL` — der 20:31-Run war korrekt. Damit wir bei der nächsten Anomalie direkt sehen, woher der NULL kommt:

**Fix in `supabase/functions/briefing-deep-parse/index.ts`:**
- Direkt nach dem Body-Parsing:
  ```ts
  if (!projectId) {
    console.warn('[deep-parse] projectId NULL', {
      userId: user?.id,
      briefingLen: briefing?.length ?? 0,
      hasAuth: !!authHeader,
    });
  }
  ```
- Kein Verhalten ändert sich, nur Sichtbarkeit im Edge-Function-Log.

---

### Verifikation nach Deploy

1. Neue Briefing-Analyse mit Samuel als Sprecher starten.
2. `composer_production_plans` letzter Eintrag → `project_id` ist UUID **und** im `manifest.scenes[].characterVoiceId` steht eine echte ElevenLabs-Voice-ID (z.B. `JBFqnCBsd6RMkjVDRZzb`).
3. Nach "Plan anwenden": `composer_scenes.character_voice_id` ist gesetzt, im Audio-Sheet steht die Stimme automatisch vorgewählt, `character_shots` enthält **einen** Eintrag pro Person.
4. Plan-Sheet zeigt **keine** gelbe "voices unresolved"-Warnung mehr.

---

### Was NICHT angefasst wird
- `useStoryboardTransition` (Handoff funktioniert)
- Lipsync-Pipeline, Sync.so, HappyHorse-Green-Net
- Prompt-Komposition, Shot Director, Cinematic Style Presets

**Geschätzter Aufwand:** 3 Dateien, ~40 Zeilen Diff insgesamt.