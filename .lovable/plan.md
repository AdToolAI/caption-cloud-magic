## Ziel

Pro Szene ein **Dialog-Skript** schreiben können (Drehbuch-Format), bei dem mehrere Charaktere mit Lip-Sync miteinander sprechen — direkt in der Szenen-Karte, nicht versteckt im Talking-Head-Dialog.

## Was schon da ist (wiederverwenden)

- `TalkingHeadDialog.tsx` hat bereits einen **„Dialog"-Tab** mit:
  - Script-Parser (`NAME: text` pro Zeile)
  - Voice-Picker pro Sprecher
  - HeyGen-Generierung pro Zeile via `useTalkingHead.generate()`
  - Auto-Attach an Folgeszenen
- `composer_scenes.character_shots` (gerade neu) hält das Multi-Cast pro Szene
- HeyGen-Pipeline (idempotenter Refund, ~0,30€/Clip) ist produktiv

Der Mechanismus existiert also — er ist nur nicht **pro-Szene-eingebettet**, und das Skript ist **flüchtig** (wird nicht persistiert).

## Plan — „Scene Dialog Studio"

### 1. Neue Inline-Karte `SceneDialogStudio` in `SceneCard.tsx`
Sichtbar wenn:
- `scene.clipSource.startsWith('ai-')` **und**
- `cast.length >= 2` (Multi-Charakter-Szene)

UI (kompakt, glassmorph, im Stil des bestehenden „Anker"-Panels):
```
┌─ 🎙️ Szenen-Dialog ──────────────────────────────┐
│ [Drehbuch-Textarea, monospace, autosize]         │
│ Sarah: Hi Matthew!                               │
│ Matthew: Was empfiehlst du heute?                │
│                                                   │
│ Sprecher → Stimmen:                              │
│  [👤 Sarah]   [Voice ▾ Sarah]                    │
│  [👤 Matthew] [Voice ▾ George]                   │
│                                                   │
│ 2 Blöcke · ~6s · €0.60                           │
│ [✨ Skript via AI] [🎬 Dialog generieren]        │
└──────────────────────────────────────────────────┘
```

Verhalten:
- Speaker-Liste wird live aus dem Cast + den im Skript erkannten Namen aggregiert.
- Voice-Default pro Sprecher = `character.default_voice_id` (existiert bereits im `brand_characters`-Schema), Fallback auf eine Preset-Voice.
- "Dialog generieren" ruft pro erkanntem Block `useTalkingHead.generate()` auf — parallel — und legt die Clips als **eigene Sub-Szenen direkt nach der aktuellen Szene** an (Shot-Reverse-Shot). Die Mutter-Szene bleibt unverändert (B-Roll/Establishing).
- Optional-Toggle: „**In diese Szene replacen**" — dann wird das erste Clip an `scene.clipUrl` gehängt und weitere als Folge-Szenen angelegt.

### 2. Persistierung des Skripts
Neue Spalten in `composer_scenes`:
```sql
alter table composer_scenes
  add column if not exists dialog_script text,
  add column if not exists dialog_voices jsonb not null default '{}'::jsonb;
```
- `dialog_script` = roher Drehbuch-Text
- `dialog_voices` = `{ [characterId]: voiceId }`
- In Loader/Persist (3 Stellen, analog zu `character_shots` heute) durchschleifen.
- TS-Type: `dialogScript?: string`, `dialogVoices?: Record<string, string>` in `ComposerScene`.

### 3. AI-Skript-Generator-Button
„✨ Skript via AI" ruft `structured-prompt-compose` (oder eine kleine neue Edge-Function `generate-scene-dialog`) mit:
- Cast-Namen + Rollenbeschreibungen
- `scene.aiPrompt` als Kontext
- `scene.durationSeconds` als Längenbudget (≈ 2,5 Wörter/Sekunde × Sprecherzahl)
- Sprache aus `project.language`

Antwort = fertiges Drehbuch im `NAME: text`-Format → in die Textarea einfügen.
**Nutzt Lovable AI Gateway (Gemini 2.5 Flash)** — kein neuer Key.

### 4. Generierungspfad
Wir benutzen den bestehenden Parser + `generate()` aus `TalkingHeadDialog.tsx` — aber da der Parser/Speaker-Aggregator dort als private Helfer leben, **extrahieren** wir sie nach `src/lib/talking-head/parseDialogScript.ts` und importieren sie sowohl im Dialog als auch in der neuen SceneCard-Karte.

Beim Klick auf „Dialog generieren":
1. `parseDialogScript(script, cast)` → `DialogBlock[]`
2. Für jeden Block: `await generate({ characterId, voiceId, text, aspectRatio, resolution, projectId, sceneId: <neu erzeugte sub-scene> })` (parallel mit `Promise.all`, Concurrency-Limit 3)
3. Pro Erfolg: neue `composer_scene` per `insertScene()` direkt unter der Mutter-Szene, mit `clipUrl`, `clipStatus='ready'`, `lipSyncWithVoiceover=true`, vorbelegtem `characterShot` für den Sprecher und einer Mini-Beschreibung („Sarah: Hi…").

### 5. Director's Cut Übergabe
Da die generierten Clips als eigene Composer-Szenen entstehen, läuft der bestehende „Render All & Stitch → Director's Cut"-Pfad **unverändert** durch — Lip-Sync ist im HeyGen-Output bereits eingebrannt.

## Geänderte / neue Dateien

**Neu**
- `src/lib/talking-head/parseDialogScript.ts` (Parser + Speaker-Aggregator extrahiert)
- `src/components/video-composer/SceneDialogStudio.tsx` (Inline-Karte)
- `supabase/functions/generate-scene-dialog/index.ts` (kleine Lovable-AI Wrap-Function — optional, kann auch via vorhandener `structured-prompt-compose` laufen)

**Geändert**
- DB-Migration: `dialog_script`, `dialog_voices` auf `composer_scenes`
- `src/types/video-composer.ts` — Type erweitert
- `src/components/video-composer/VideoComposerDashboard.tsx` (Loader 2× + Persist)
- `src/hooks/useComposerPersistence.ts` (Insert + Update)
- `src/components/video-composer/SceneCard.tsx` — Slot für `SceneDialogStudio`
- `src/components/video-composer/TalkingHeadDialog.tsx` — Parser-Import statt lokal definieren

## Out of Scope
- Multi-Speaker-Lip-Sync **innerhalb eines einzigen Frames** (zwei Münder gleichzeitig). HeyGen kann das nicht — wir generieren weiter pro Sprecher einen eigenen Cut, was filmisch auch stärker wirkt (Shot-Reverse-Shot).
- Voiceover-Tab Sync — die Skripte hier sind getrennt vom globalen VO-Track.

## Kosten
Pro Dialog-Block (= eine Zeile, ~3–6s): ~0,30 € HeyGen + ~0,01 € ElevenLabs TTS (falls Stimme nicht vorgenerted). Ein 4-Zeilen-Dialog ≈ **1,20 €**.

Soll ich loslegen?
