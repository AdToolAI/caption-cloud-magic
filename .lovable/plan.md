# Fix: "Skript schreiben" nicht öffnenbar & keine Stimme auto-zugewiesen

## Diagnose

Der Plan im Sheet sieht gut aus (Director's Vision, framing, cast resolved zu `Samuel Dusatko`) — aber nach **„Plan anwenden"** landet der Cast **nicht** in der Szene:
- Cast-Row: Warnung „Samuel Dusatko kommt in keiner Szene vor"
- Szene 4 hat 0 Anker → `twoshot_audio_prep_failed: missing_voice`
- „Skript schreiben"-Button bleibt ausgeblendet, weil `sceneCastCount < 1`

### Ursache
1. **Pass-B-Resolver** liefert Cast mit leicht anderem `mentionKey`-Format (z. B. `samueldusatko` statt `@samuel-dusatko`) → strikter `===`-Match in `mergeManifestAndResolution` schlägt fehl → `characterId = null` → `planSceneToComposerScene` filtert ihn raus (Filter `c.characterId`).
2. Selbst wenn Character matched: wenn `default_voice_id` am `brand_character` leer ist, fällt `dialogVoices` weg → `compose-dialog-segments` erkennt „missing_voice".
3. UI versteckt den „Skript schreiben"-Button bei 0 Cast → User kann nicht manuell nachziehen.

## Fixes (3 Dateien)

### 1) `supabase/functions/briefing-deep-parse/index.ts`
- In `mergeManifestAndResolution`: fuzzy Cast-Match per `normalizeMention` (Fallback zu strict `===`).
- Direkt nach `mergeManifestAndResolution` im Handler: **Local-Fill-Pass**, der für jede Cast-Position mit `characterId === null` lokal über die geladene `characters`-Library fuzzy-sucht und bei Treffer `characterId`, `characterName` und `voiceId` (default_voice_id) nachträgt. Voice-Fallback: wenn weiterhin null, nimmt project-level `plan.voice.voiceId`.

### 2) `src/hooks/useApplyProductionPlan.ts`
- In `planSceneToComposerScene`: wenn ein resolved Cast-Member **keine** `voiceId` hat, mit `plan.voice.voiceId` (Project-Default) auffüllen, sodass `dialogVoices[characterId]` immer gesetzt ist und `compose-dialog-segments` keine „missing_voice" wirft.
- Signatur erweitern um `projectVoiceId` Argument (aus `plan.voice?.voiceId`).
- Console-Warning loggen, wenn eine `lipSync`-Szene 0 `characterShots` nach Apply hat (damit wir Resolver-Issues künftig sehen).

### 3) `src/components/video-composer/SceneCard.tsx` (Zeile ~1731–1790)
- „Skript schreiben"-Button-Bedingung lockern:
  ```ts
  if (sceneCastCount < 1 && scene.dialogMode !== true) return null;
  ```
  → Button erscheint auch bei 0 Cast, sobald `dialogMode === true` (Lipsync-Engine), damit User das Studio öffnen, Cast zuweisen und Stimme picken kann.
- `SceneDialogStudio` (Zeile ~1813) Render-Bedingung gleich lassen (verlangt schon `dialogMode === true`), aber Studio rendert auch ohne Cast — User kann dort den Cast-Picker nutzen.

## Antwort auf „Passt der Briefing-Plan so?"
**Ja, inhaltlich top:** 3 Szenen mit klarer Pain→Reveal→CTA-Architektur, Director's Vision mit Framing/Lens/DOF, korrekt resolved auf `@samuel-dusatko` und `@home-office`, Engine `cinematic-sync`. Einziger Schwachpunkt war die **Übergabe in die Szenen** (siehe Fix 1+2) — der Plan selbst ist sauber.

---

**Bitte in den Build-Mode wechseln, dann setze ich die 3 Fixes parallel um und re-deploye die Edge Function.**
