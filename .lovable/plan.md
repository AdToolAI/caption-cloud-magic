
## Korrektur zum vorigen Plan

Du hast Recht — die v5 Pipeline (`compose-dialog-segments` + Sync.so Segments-API) ist intern N-speaker fähig (`speakers.forEach`, refIds, multi-pass Chain) und soll für **1 bis 4 Sprecher** der einzige Cinematic-Sync-Pfad bleiben. Wir routen also **nicht** auf `compose-lipsync-scene` um, sondern entfernen den 2-Sprecher-Mindestgate aus der Vorstufe, damit `audio_plan.twoshot` auch für 1 Sprecher erzeugt wird.

## Root Cause (präzisiert)

Zwei harte `>= 2` / `< 2` Gates blockieren Single-Speaker:

1. **`supabase/functions/compose-video-clips/index.ts` Z. 861** — `if (speakerLines.length >= 2)` umschließt den `compose-twoshot-audio`-Fetch. Single-Speaker-Szenen springen daran vorbei → `audio_plan.twoshot` wird nie gebaut.
2. **`supabase/functions/compose-twoshot-audio/index.ts` Z. 404** — `if (blocks.length < 2) return 400 single_speaker_or_empty`. Selbst wenn (1) gefixt ist, lehnt die Function die Single-Speaker-Szene aktiv ab.

Folge: `compose-dialog-segments` läuft mit leerem `audio_plan.twoshot` → `422 missing_audio_plan` → roter Toast.

`compose-dialog-segments` selbst ist N-fähig — die Schleife `speakers.forEach((sp, sIdx) => …)` (Z. 297) verarbeitet beliebig viele Sprecher; mit 1 Sprecher entstehen 1 Pass + Refunds + Webhook genau wie mit 3.

## Fix (2 Mini-Edits, keine Logik-Umbauten)

### 1. `supabase/functions/compose-video-clips/index.ts` (Z. 861)

```ts
// vorher:
if (speakerLines.length >= 2) {
// nachher:
if (speakerLines.length >= 1) {
```

So wird `compose-twoshot-audio` auch für Single-Speaker-Dialog-Szenen aufgerufen und `audio_plan.twoshot.{url, speakers[1], totalSec}` aufgebaut, bevor Hailuo den Master-Clip rendert.

### 2. `supabase/functions/compose-twoshot-audio/index.ts` (Z. 402–406)

```ts
// vorher:
const blocks = parseDialogScript(dialogScript);
if (blocks.length < 2) {
  return json({ error: "single_speaker_or_empty", blocks: blocks.length }, 400);
}
// nachher:
const blocks = parseDialogScript(dialogScript);
if (blocks.length < 1) {
  return json({ error: "empty_dialog_script", blocks: 0 }, 400);
}
```

Die nachfolgende TTS-/Concat-/Upload-Logik ist bereits per-block, daraus entsteht für 1 Block: 1 Speaker-Entry in `speakers[]` mit korrekter `voicedRange.turns[]`, ein Master-WAV mit genau diesem einen Sprecher und ein per-speaker padded Track. Sample-accurate Pipeline bleibt unverändert.

### 3. Routing in `src/hooks/useTwoShotAutoTrigger.ts`

**Keine Änderung** — `compose-dialog-segments` bleibt für alle 1..N-Sprecher der Default. Der vorige Plan-Vorschlag, Single-Speaker auf `compose-lipsync-scene` umzuleiten, wird verworfen.

## Was unverändert bleibt

- `compose-dialog-segments` (N-speaker Logik bereits korrekt)
- `sync-so-webhook`, `poll-dialog-shots`, Refund-/Watchdog-Pfade
- Audio-Mux Lambda für Multi-Speaker bleibt aktiv für `passes.length >= 2`; bei 1 Sprecher greift weiterhin der direkte Finalize-Pfad (siehe Memory „Sync-segments multi-speaker audio mux" — Single-Speaker = direkter Finalize, weil Pass 0 Audio = Master).
- Kein DB-Schema-Change, kein Hook-Change, kein Sync.so-Plan-Update erforderlich (Creator-Plan reicht für 1+3 Sprecher).

## Dateien

| Datei | Änderung |
|---|---|
| `supabase/functions/compose-video-clips/index.ts` | Gate `>= 2` → `>= 1` für Two-Shot-Audio-Prep |
| `supabase/functions/compose-twoshot-audio/index.ts` | Gate `< 2` → `< 1`, Fehler umbenennen |

Nach dem Deploy: bestehende fehlgeschlagene Single-Speaker-Szene einmal "Lip-Sync erneut versuchen" → der Auto-Trigger reicht sie sauber durch (`audio_plan.twoshot` wird beim nächsten Master-Render aufgebaut; alternativ direkt `compose-twoshot-audio` über die Voiceover-Tab-Aktion antriggern).
