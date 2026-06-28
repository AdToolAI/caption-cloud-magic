## Nein — Briefing ist NICHT vollständig im Storyboard angekommen

**Was die DB sagt** (Projekt `f39042bd…`, dein aktuelles):

| Szene | dialog_script | ai_prompt | voice | mentions | clip_status |
|---|---|---|---|---|---|
| 0 Hook | „Ich melde mich gleich morgen an!" | `[SceneAction] Establishing shot: A relevant setting…` | `null` | `[]` | **failed** |
| 1 Lösung | *(leer)* | `Reveal beat for the brand: cinematic establishing shot…` | `null` | `[]` | **canceled** |
| 2 CTA | *(leer)* | `CTA beat for the brand: cinematic establishing shot…` | `null` | `[]` | **canceled** |

Das sind 1:1 die Fallback-Strings. Was du im Screenshot links siehst („Es ist 3 Uhr nachts…") ist nur die lokale Sheet-Anzeige — nicht persistiert.

**Was die DB gleichzeitig sagt** (`composer_production_plans`, vor 4 Min., 10s Parse-Zeit, Pass A+B beide grün):

```json
"voiceover": { "text": "Es ist 3 Uhr nachts. Und ich bearbeite... schon wieder... ein Reel." }
"performance": { "mimik": "Erschöpft, leicht resigniert…" }
"shotDirector": { "framing": "extreme-close-up", "lighting": "low-key", "movement": "static" }
"anchorPromptEN": "Extreme close-up on Samuel's face, illuminated only by the glow…"
"cast[0]": { "voiceId": "CwhRBWXzGAHq8TQ4Fs17", "characterId": "483f9cdc-…" }
```

Der echte Plan ist also **da** — sauber, mit Voice, Performance, Shot, Anchor. Er wurde nur **nie ins Storyboard geschrieben**.

## Warum

Der Late-Arrival-Replace, den wir gestern deployed haben, prüft als Schutz `clip_status === 'pending'`. Deine Szenen sind aber `failed` (Hook, weil HappyHorse den Prompt blockiert hat) bzw. `canceled` (Lösung/CTA, weil du den Plan vor Abschluss erneut angewendet hast). → Filter greift, Late-Replace passiert nicht, du siehst Fallback.

Zusätzlich: selbst beim ersten Apply hat `useApplyProductionPlan` zwar `dialog_script` geschrieben, aber `character_voice_id` und `mentioned_character_ids/locations` blieben leer, weil der Fallback-Plan diese Felder nicht trägt.

## Fix (3 chirurgische Edits, kein Lipsync-Code, kein Prompt-Code)

### 1. `src/hooks/useStoryboardTransition.ts` — Late-Replace auch für `failed`/`canceled`
In der Schutz-Bedingung für Late-Arrival neben `clip_status === 'pending'` zusätzlich `'failed'` und `'canceled'` zulassen. Die anderen Filter (`clip_url IS NULL`, `lipSyncStatus IS NULL`, `dialogLockedAt IS NULL`, `lockReferenceUrl IS NULL`, keine `dialog_shots`-Zeile) bleiben unangetastet — die schützen das was wirklich schützenswert ist (fertige Renders, aktive Lipsync). Eine kaputt-gerenderte Szene zu ersetzen ist genau gewollt.

### 2. `useApplyProductionPlan.ts` — Voice/Mentions auch beim Late-Replace mappen
Beim Late-Apply denselben Mapping-Pfad nehmen, den der erste Apply nutzt (`mentionedCharacterIds`, `mentionedLocationIds`, `characterVoiceId` für single-speaker fast-path). Aktuell läuft Late-Replace über einen schmaleren Branch. Quelle: `plan.scenes[i].cast[0].voiceId` → `character_voice_id`, `cast[*].characterId` → `mentioned_character_ids`.

### 3. Sicht-Indikator im Sheet wenn Apply Felder leer gelassen hat
Pro Szene im Sheet ein 4-Chip Mapping-Badge nach Apply (gelesen 2s post-Apply aus `composer_scenes`):

```
Skript ✅  Voice ⚠️ (kein default)  Mentions ✅  Shot ✅
```

Macht den nächsten Drift in einer Zeile sichtbar statt dass du fragen musst.

## Was bewusst NICHT angefasst wird
Lipsync-Pipeline, Sync.so, `dialog_shots`, HappyHorse Green-Net, Hailuo-Duration-Lock, Pass-A/B-Schema, Prompts, der DB-Schutz für `dialog_locked_at`/`lock_reference_url`/aktive `lipSyncStatus`.

## Erwartetes Ergebnis nach Fix
- Du drückst „Plan anwenden" → Hook (failed) + Lösung/CTA (canceled) werden überschrieben mit echtem Voiceover-Text, Anchor-Prompt EN, Shot-Director, Voice und Mentions.
- Beim nächsten Briefing siehst du sofort im Sheet welche Szenen sauber gemappt sind und welche nicht.
- Diese drei Edits berühren keine Datei aus den Lipsync-Memories.

Freigabe zum Umsetzen?