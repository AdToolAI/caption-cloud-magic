## Diagnose — was du in den Screenshots siehst

**Ja, gleiche Pipeline.** Die 1-Sprecher-Szene (Matthew, "Wie kann es sein…") läuft auf Engine **`Fast Dialog` = `sync-segments`** = exakt derselbe Code wie 2–4 Sprecher: `compose-dialog-segments` → Sync.so **Model `sync-3`** (v62: sync-3 ist universal default für N=1 und N≥2). Es gibt keinen "1-Sprecher-Sonderpfad" mehr. HeyGen war hier *nicht* aktiv — der Hinweistext "Lip-Sync via HeyGen" stimmt mit der gewählten Engine nicht überein und ist ein UI-Bug (siehe Fix 3).

**Warum die Lippen trotzdem still sind**, steht direkt im Director Score:

> ⚠️ **"Dialog Mismatch — Dialog vorhanden aber kein Audio Plan gelockt — generiere das Voiceover, damit Timings fixiert sind."**

Konkret: Der Hailuo-Clip wurde gerendert und das Voiceover existiert, aber `scene.audio_plan.twoshot.url` (die gemerged Master-WAV mit `speakers[].voicedRange.turns[]`) wurde **nie geschrieben**. `compose-dialog-segments` returnt in dem Fall hart:

```ts
if (!masterAudioUrl || speakers.length === 0 || totalSec <= 0) {
  return 422 "Sync-Segments requires compose-twoshot-audio output…"
}
```

→ Sync.so wird nie gerufen, Plate spielt ohne Mundbewegung, VO läuft drüber als Off-Screen-Narration. Genau dein Eindruck.

Das passiert, weil du den Clip mit "🎬 Clip generieren" gerendert hast statt mit "🔊 **Clip generieren mit Voiceover**" (der Knopf direkt im Audio-Block, Screenshot 1). Nur der zweite Knopf zwingt `compose-twoshot-audio` davor.

## Fix

### 1. Auto-Lock Audio-Plan vor Sync-Segments-Render *(Hauptfix)*

In `compose-video-clips` (Composer Render-Entry) für Szenen mit `engine_override='sync-segments'` ODER auto-routed Dialog:
- Wenn `audio_plan.twoshot.url` fehlt UND `dialogScript` + Cast vorhanden → **vor** Hailuo-Dispatch `compose-twoshot-audio` aufrufen (auch für N=1; die Funktion mergt trivial bei 1 Sprecher).
- Damit ist der Audio-Plan garantiert gelockt, sobald die Plate fertig ist und `useTwoShotAutoTrigger` greift.

### 2. Auto-Retrigger für bestehende Szenen ohne Audio-Plan

In `useTwoShotAutoTrigger` (sieht die Szene alle 8s an):
- Neue Bedingung: `clip_status='ready'` + `dialogScript` + Cast + `engine='sync-segments'` + **`!audio_plan.twoshot.url`** → dispatch `compose-twoshot-audio` once (idempotent via existing `twoshot_stage='audio'` lock). Sobald die WAV da ist, läuft der bestehende Pfad nach `compose-dialog-segments` weiter.
- Heißt: deine aktuelle "Problem"-Szene wird ohne Re-Render nachträglich gelipsynct.

### 3. UI-Text-Bug "Lip-Sync via HeyGen" für Sync-Segments-Engine

In der Audio-Karte (SceneCard / DialogStudioSheet) wird der Hinweis "Lip-Sync via HeyGen — Mund passt zum Audio (~€0.30)" angezeigt, obwohl die Engine `Fast Dialog` (Sync.so) ist. Den Text engine-abhängig machen:
- `engine='heygen-talking-head'` → "Lip-Sync via HeyGen (~€0.30/Sprecher)"
- `engine='sync-segments'` → "**Lip-Sync via Sync.so sync-3 — Mund passt zum Audio (~€0.20/s)**"
- `engine='broll'` → "Voiceover als Off-Screen-Narration (kein Lip-Sync)"

### 4. Director-Score Action-Button

Die Director-Score-Karte ("Dialog Mismatch — kein Audio Plan gelockt") bekommt einen **"🔊 Voiceover jetzt generieren"** Quick-Action der genau `compose-twoshot-audio` für die Szene triggert. Damit der User sich nicht durchklicken muss.

## Geänderte Dateien

- `supabase/functions/compose-video-clips/index.ts` — Pre-flight `compose-twoshot-audio` bei sync-segments ohne Audio-Plan
- `src/hooks/useTwoShotAutoTrigger.ts` — Neuer Auto-Lock-Branch für ready-Clips ohne `twoshot.url`
- `src/components/video-composer/scene/AudioBlock.tsx` (oder vergleichbare Karte) — engine-abhängiger Lipsync-Hinweistext
- `src/components/video-composer/scene/DirectorScoreCard.tsx` — Quick-Action-Button für "Voiceover generieren"

## Was *nicht* gemacht wird

- Keine Pipeline-Architektur-Änderungen. Sync.so `sync-3` bleibt universal default (v62). v75 (moving master + windowed overlays) bleibt unverändert.
- Keine Migration bestehender Szenen — Auto-Retrigger (#2) holt sie automatisch nach.
