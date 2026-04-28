## Ziel

Die 4 UI-Schichten (Cinematic Presets, Director Modifiers, Shot Director, Visual Style) und 2 Server-Schichten (`enrichPrompt`, `injectCharacter`) im Motion Studio so vereinheitlichen, dass:
- keine Achse (vor allem **Lighting**) doppelt belegt wird,
- Brand Character Lock auch im Composer greift,
- der Audio-Toggle für **alle** Provider tatsächlich wirkt,
- der User vor dem Generieren sieht, was das Modell wirklich bekommt.

---

## Phase 1 — Zentraler Prompt-Composer (Client)

**Neue Datei:** `src/lib/motion-studio/composePromptLayers.ts`

Eine reine Funktion, die als **einzige Quelle** für den finalen Prompt dient. Ersetzt die verstreuten Aufrufe in `ClipsTab.tsx` (Z. 285–292) und `SceneCard.tsx` (Z. 775–780).

```text
Input: { rawPrompt, slots, shotDirector, directorModifiers,
         cinematicPreset, visualStyle, brandCharacter, characters, locations }

Pipeline (deterministisch):
  1. resolveMentions()         → Text + autoRefImage
  2. dedupeAxes()              → NEU: erkennt Lighting/Camera/Mood-Konflikte
  3. applyDirectorModifiers()  → nur Achsen, die nicht schon belegt sind
  4. buildShotPromptSuffix()   → Cinematography-Suffix
  5. injectBrandCharacter()    → NEU client-seitig, falls aktiv
  6. return { finalPrompt, referenceImageUrl, conflictsResolved[] }
```

**`dedupeAxes()`-Regeln (Konflikt-Auflösung mit Priorität):**

| Achse | Priorität (höchste gewinnt) |
|---|---|
| Lighting | Shot Director > Cinematic Preset > Director Modifier > Visual Style |
| Camera/Movement | Shot Director > Cinematic Preset > Director Modifier |
| Mood/Color Grade | Cinematic Preset > Director Modifier > Visual Style |
| Lens/Film-Stock | Director Modifier (einzige Quelle) |

Konflikte werden im Return-Objekt gemeldet → UI zeigt sie an.

---

## Phase 2 — Brand Character Lock im Composer

**Geändert:** `src/components/video-composer/SceneCard.tsx`, `ClipsTab.tsx`, `supabase/functions/compose-video-clips/index.ts`

- Hook `useActiveBrandCharacter()` lesen (existiert bereits via `useBrandCharacters`).
- Wenn aktiv: `brandCharacter.identityCardPrompt` via neuen Composer **vor** `rawPrompt` injizieren, `brandCharacter.referenceImageUrl` als Fallback für `referenceImageUrl` setzen, **nur** wenn Scene keinen eigenen Reference hat.
- Edge Function: neues optionales Feld `brand_character_prompt` im Scene-Payload — wird in `enrichPrompt` als erstes injiziert, mit Token-Hash-Dedupe gegen `injectCharacter` (siehe Phase 4).

---

## Phase 3 — Server-seitige Negative-Prompt-Sanitizer

**Geändert:** `supabase/functions/compose-video-clips/index.ts` (Z. 231–252)

Statt nur `/no on-screen text.../` zu entfernen, eine Regex-Liste aller bekannten Negativ-Phrasen:

```text
NEGATIVE_LEAK_PATTERNS = [
  /,?\s*no on-screen text[^.,]*/gi,
  /,?\s*without (text|logos|captions|subtitles)[^.,]*/gi,
  /,?\s*avoid (text|logos|watermarks)[^.,]*/gi,
  /,?\s*no (text|captions|logos|watermark)[^.,]*/gi,
]
```

Diese Phrasen werden **stripped** — die Konzepte landen ausschließlich im separaten `negative_prompt`-API-Parameter (bereits korrekt implementiert).

---

## Phase 4 — Character-Dedupe via Token-Hash

**Geändert:** `supabase/functions/compose-video-clips/index.ts` (`injectCharacter`, Z. 202–229)

Aktuell: 30-Zeichen-Substring-Probe → fragil bei Umformulierung.

Neu:
```text
1. Tokenisiere appearance + signatureItems in Wort-Set (lowercase, stoppwort-frei).
2. Tokenisiere Prompt in gleiches Set.
3. Wenn Jaccard-Overlap ≥ 0.6 → skip injection (schon vorhanden).
4. Sonst injizieren.
```

Verhindert doppelte Charakter-Beschreibung wenn Mention-Resolution den Text leicht umformuliert hat.

---

## Phase 5 — Audio-Flag-Audit pro Provider

**Geändert:** `supabase/functions/compose-video-clips/index.ts` (Provider-Branches Z. 357–693)

Für **jeden** Provider explizit verifizieren und ergänzen:

| Provider | Audio-API | Aktion |
|---|---|---|
| Veo 3.1 | `generateAudio: bool` | Bestätigen, dass `withAudio` durchgereicht wird |
| Kling 3 Omni | `with_audio: bool` | Bestätigen |
| Hailuo 2.3 | kein Audio | UI-Toggle ausgrauen (capabilities.audio: false) |
| Sora 2 | kein API-Toggle | FFmpeg-Mute beim Stitching (existiert) |
| Wan 2.5 | kein Audio | UI-Toggle ausgrauen |
| Seedance 2 | kein Audio | UI-Toggle ausgrauen |
| Luma Ray 2 | kein Audio | UI-Toggle ausgrauen |
| Grok Imagine | `audio: bool` | Bestätigen |

Registry `src/config/aiVideoModelRegistry.ts` als Single Source of Truth — `capabilities.audio` muss faktisch korrekt sein.

---

## Phase 6 — Live-Prompt-Preview-Panel

**Geändert:** `src/components/video-composer/SceneCard.tsx` (Z. 770–800)

Bestehende Vorschau (`finalPrompt`-Anzeige) ersetzen durch ein **aufklappbares 6-Layer-Panel**:

```text
┌─ FINAL PROMPT (was das Modell bekommt) ────────────────┐
│ [Brand Character: "Sarah, 34, ..."]                     │ ← grün wenn aktiv
│ [Raw: "woman walks to coffee shop"]                     │
│ [+ Director Mods: ", Arri Alexa, 35mm..."] [3 conflicts]│ ← gelb bei Konflikt
│ [+ Shot Director: "Cinematography: ..."]                │
│ [- Stripped: "no on-screen text"] (moved to negative)   │ ← grau
│ [+ Server: "+ clean cinematic, +i2v motion cue"]        │ ← blau
│ ─────────────────────────────────────────────────────── │
│ NEGATIVE: "text, captions, watermark, ..."              │
│ REFERENCE IMAGE: [thumbnail] (from brand character)     │
│ AUDIO: ✓ enabled (Veo: generateAudio=true)              │
└─────────────────────────────────────────────────────────┘
```

Nutzt `composePromptLayers()`-Output (mit `conflictsResolved[]`). Konflikte als gelbe Badges anzeigen mit Tooltip "Lighting wurde von Shot Director übernommen, Cinematic Preset ignoriert."

---

## Technische Details

**Geänderte Dateien:**
- **NEU**: `src/lib/motion-studio/composePromptLayers.ts` (~120 Zeilen)
- **NEU**: `src/lib/motion-studio/dedupeAxes.ts` (~80 Zeilen)
- **GEÄNDERT**: `src/components/video-composer/ClipsTab.tsx` (Z. 285–305, 396–402)
- **GEÄNDERT**: `src/components/video-composer/SceneCard.tsx` (Z. 770–800, neuer Preview-Block)
- **GEÄNDERT**: `supabase/functions/compose-video-clips/index.ts` (`enrichPrompt`, `injectCharacter`, Negative-Sanitizer, Brand-Character-Field)
- **GEÄNDERT**: `src/config/aiVideoModelRegistry.ts` (Audio-Capabilities-Audit für alle 9 Provider)
- **GEÄNDERT**: `src/types/video-composer.ts` (`ComposerScene` bekommt optional `brandCharacterId`)

**Keine DB-Migrationen** — alle Änderungen sind Code-Layer.

**Keine neuen Edge Functions** — bestehende `compose-video-clips` wird erweitert.

**Backward-compatible** — wenn `composePromptLayers` keine neuen Schichten findet, fällt das Verhalten auf den aktuellen Stand zurück.

---

## Akzeptanzkriterien

1. Wählt User „Cinematic Noir" + Director Modifier „warm tungsten" + Shot Director „golden hour" → finaler Prompt enthält **nur eine** Lighting-Anweisung (golden hour gewinnt), Konflikt-Badge sichtbar.
2. Aktiviert User einen Brand Character → Preview zeigt Identity Card als erste Layer, Reference-Image automatisch gesetzt.
3. Schreibt User „avoid logos and text" in den Prompt → wird im Preview gestrichen, taucht im Negative-Prompt auf.
4. `@character` mit großer Beschreibung wird nicht doppelt im finalen Prompt eingefügt (Jaccard-Test).
5. Audio-Toggle für Hailuo/Wan/Seedance/Luma ist ausgegraut mit Tooltip „Modell unterstützt keinen Sound".
6. Audio-Toggle für Veo/Kling/Grok schaltet im Provider-Input nachweislich `generateAudio`/`with_audio`/`audio` um.
7. Preview-Panel zeigt alle 6 Layer einzeln, klar gefärbt.

---

## Memory-Update nach Implementierung

Neue Memory: `mem://architecture/video-composer/unified-prompt-composer` — Single-Source-of-Truth-Pipeline, Achsen-Prioritäten, Brand-Character-Auto-Inject im Composer.