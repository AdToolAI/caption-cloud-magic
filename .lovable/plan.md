# v230 — Performance & Life-Layer (revidiert)

Zwei zusammengehörige Verbesserungen: (a) das Restzucken der Lippen bei Nicht-Sprechern **dämpfen ohne die Szene einzufrieren**, und (b) Mimik/Gestik/Blick/Energy pro Sprecher aus dem Briefing kontextuell autofüllen.

## Teil A — Idle-Lip-Motion dämpfen, nicht abschalten

Statt „mouth completely motionless" (wirkt tot) zielen wir auf **stumme, natürliche Ruhe**: minimales Atmen durch die Nase, sehr seltene Mikro-Zuckungen, aber **kein Lippen-Flapping, kein Muttern, kein Kau-Rhythmus, kein Sprech-Muster**. Damit bleibt die Szene lebendig, sync-3 hat trotzdem einen sauberen Idle-Zustand.

Änderungen in `supabase/functions/compose-video-clips/index.ts`:

1. **Plate-Wortlaut** `neutralTwoShotPrompt` (N≥2-Variante): Ergänzung am Ende:
   *"Non-speakers stay silently at rest — lips softly closed, breathing calmly through the nose, only micro facial life (occasional blinks, tiny weight shifts, a soft swallow at most). No lip-flap, no chewing pattern, no rhythmic mouth motion, no whispering shapes; the mouth never forms syllables."*
2. **Master-Suffix** `buildCinematicSyncMasterPrompt`: analoges Kurz-Statement (ein Satz), damit der Renderer die Regel selbst sieht.
3. **Negativ-Prompt** (`CINEMATIC_SYNC_SILENT_MASTER_NEGATIVE`): Ergänzung um die *speech-artigen* Muster, ohne totale Bewegungssperre:
   `rhythmic lip motion, syllable-shaped mouth, whispering lips, lip-flap, chewing pattern, mouth mouthing words, non-speaker mouthing along`.

Damit bleiben Atmen, Blinzeln, Mikro-Bewegung erlaubt — nur Sprech-artige Muster werden unterdrückt. Sync.so-Parameter bleiben unangetastet (auto_detect, sync-3, 720p Preclip).

## Teil B — Performance-Autofill aus dem Briefing (kontextbasiert)

Aktuell (v177) sind Performance-Defaults **statisch pro Beat-Rolle**. Wir erweitern Pass A in `supabase/functions/briefing-deep-parse/index.ts`, damit das LLM pro Sprecher pro Szene **charakter- und tonalitätsspezifisch** ableitet.

Neuer Prompt-Block (zwischen Intelligent-Defaults und Schluss-Regeln):

```
PERFORMANCE INFERENCE (per character per scene, MANDATORY):
For every character in `cast`, emit `performance[characterId]` with:
- expression ∈ {neutral, warm-smile, curious, concerned, confident, surprised}
- gesture   ∈ {still, hand-on-chin, open-palms, point, cross-arms, lean-in}
- gaze      ∈ {to-camera, to-speaker, away, down-thinking}
- energy    ∈ 1..5

Derive values from the character's role/attitude in the briefing
(skeptical customer → concerned/cross-arms/away/2; enthusiastic
founder → confident/open-palms/to-camera/4; expert → confident/
hand-on-chin/to-speaker/3; listener → curious/still/to-speaker/2).
If the briefing gives no attitude cue, fall back to the beat-role
defaults from Intelligent-Defaults. Never invent narrative content.
Track each auto-filled axis in `_meta.aiFilled` as
`performance.<characterId>.<axis>`.
```

Zusätzlich:

- `src/lib/video-composer/briefing/productionPlan.ts`: sicherstellen, dass `performance` sowohl als `Record<characterId, ScenePerformance>` als auch als flaches Objekt akzeptiert wird (Backwards-Compat).
- `src/hooks/useApplyProductionPlan.ts`: beim Übertragen als per-Character-Map schreiben; flaches Objekt auf alle aktiven Cast-Slots derselben Szene fannen. Bestehende `mapExpression/mapGesture/mapGaze`-Enum-Filter bleiben (Schutz gegen unbekannte Werte).
- `ensureEnsembleScene.ts` / `ensurePlanEnsemble.ts`: nachträglich hinzugefügte Cast-Slots bekommen v177-Beat-Defaults, damit kein Slot performance-leer bleibt.

**Kein Renderer-Umbau nötig**: `buildPerformanceBlock` + `derivePerformanceEntries` (in `src/lib/motion-studio/buildPerformanceBlock.ts`) rendern bereits den `[4 PERFORMANCE]`-Block in den Final-Prompt via `composeFinalPrompt`, und `buildInvokePrompt` läuft für Single-Scene-Invokes.

## Teil C — Version & Telemetrie

- `CLIENT_PIPELINE_VERSION` → 230, Server-Version im Log → 230.
- Debug-Chip zeigt Perf-Autofill-Achsen-Anzahl aus `_meta.aiFilled`.

## Nicht im Scope

- Sync.so/Rekognition/Anchor-Audit/Green-Net unverändert.
- Auto-Script/Auto-Voice bleiben leer (v229-Konzept).

## Verifikation

1. Briefing mit vier unterschiedlichen Charakteren → Sheet zeigt pro Szene per Sprecher unterschiedliche Performance-Chips.
2. Render einer 4-Cast-Szene → Nicht-Sprecher wirken ruhig aber lebendig (Atmen, Blinzeln), keine sprech-artige Lippenbewegung mehr.
3. `?debug=1` zeigt Client 230 / Server 230 + Perf-Autofill-Zähler > 0.
