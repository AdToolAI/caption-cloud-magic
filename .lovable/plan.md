
# Fix: Ghost-Speaking nach 4-Speaker-Reparatur

## Befund (warum es jetzt sichtbar ist)
- Die mutmaßliche „Promptkürzung" gab es **nicht** — Git-Diff der letzten 2 Wochen am Plate-Prompt zeigt nur ein Anti-Split-Screen-Rephrasing (19. Juni), keine Mund/Idle-Token wurden entfernt oder gekürzt.
- Die Instruktion „every visible character should be speaking naturally with subtle idle mouth and jaw movements" steht seit dem 14. Juni im Code (v112-Workaround: ohne Idle-Motion liefert sync-3 das Plate unverändert zurück, also gar keinen Lipsync).
- In den letzten Tagen lief de facto nur **Pass 0** sauber durch (1/1-Bug). Du hast also die Plate-Idle-Motion der 3 anderen Speaker als „kein Sprechen" wahrgenommen, weil keiner davon zusätzlich lipsynct war. Jetzt, wo alle 4 Passes laufen, fällt es als „Ghost Speaking" auf.

→ Es ist **kein Regress aus dem v170-Skeleton-Fix**. Es ist ein **vorhandener Plate-Prompt-Trade-off**, der durch die wiederhergestellte Parallel-Pipeline sichtbar wird.

## Lösung (Stufe A — sofort, low-risk, kein Pipeline-Refactor)

Datei: `supabase/functions/compose-video-clips/index.ts`

**Edit 1 — `neutralTwoShotPrompt` (Zeile ~652):**
Ersetze:
> „EVERY visible person independently and continuously shows subtle idle motion … Each face must move at least slightly every second. … Lips slightly parted in a relaxed neutral position with a soft visible teeth gap and a softly mobile jaw — small, subtle, natural idle mouth and jaw motion …"

durch:
> „EVERY visible person continuously shows subtle idle BODY motion — visible breathing (chest and shoulders), small natural head bobs and weight shifts, occasional blinks and gentle eye movement. **Mouths stay RELAXED AND CLOSED in a neutral resting position throughout — no chewing, no muttering, no idle mouth or jaw movement, no lip-flap. Lips touch lightly. Only the speaker currently being driven by lipsync in post will open their mouth — everyone else listens attentively with closed lips."

→ Body-Idle bleibt erhalten (verhindert Statue-Look). Mund wird explizit geschlossen.

**Edit 2 — `buildCinematicSyncMasterPrompt` (Zeile ~686):**
Ersetze den abschließenden Satz:
> „Every visible character should be speaking naturally with subtle, natural idle mouth and jaw movements throughout the entire clip (no specific words, no exaggerated speech — just lightweight, lifelike mouth motion)."

durch:
> „All visible characters keep their mouths softly closed in a natural listening pose; the active speaker's mouth area stays lip-ready (relaxed, unobstructed, soft visible lip-line) so the downstream lipsync model can drive it cleanly in post — but no character produces mouth motion in the plate itself."

→ Lip-Ready-Geometrie (was sync-3 braucht) bleibt für den aktiven Sprecher erhalten; alle Münder im Plate bleiben statisch geschlossen.

**Edit 3 — `CINEMATIC_SYNC_SILENT_MASTER_NEGATIVE` (Zeile ~339):**
Hinzufügen vor den bestehenden Tokens:
> „, idle mouth motion, idle jaw motion, mouths softly moving, mouth twitching, jaw twitching, multiple mouths flapping, group chatter, background mouth motion, listeners moving their lips, listeners' mouths moving, secondary characters speaking, non-speaker mouth movement"

→ **Nicht** wieder aufnehmen: „talking mouth, lip movement, open mouth speech" (das war der v112-Killer). Wir verbieten gezielt nur **Nicht-Speaker-Mundbewegung** + **Idle-Mundbewegung**, nicht Lipsync-Mund generell.

## Verifikation
1. Neue 4-Sprecher-Szene mit „Sauber neu starten" generieren.
2. Plate-Vorschau prüfen (bevor Lipsync läuft): **alle 4 Münder sollten geschlossen sein**, Brustkorb/Augen/Kopf bleiben in Bewegung.
3. Nach Sync.so-Run: Pass-1-Output muss Speaker 1 mit offen-animiertem Mund zeigen, Speaker 2/3/4 mit geschlossenem Mund. Analog für Pass 2/3/4.
4. **Rollback-Trigger**: Falls Sync.so ein Pass-Output liefert, der bit-identisch zum Input ist (= „still mouth → input unchanged"-Regression), Stufe A rückgängig + zu Stufe B (siehe unten).

## Stufe B (Safety Net, nur falls Stufe A Sync.so abwürgt)
Im Mux (`render-sync-segments-audio-mux`) für jede Pass-Bbox in den Frames **außerhalb** des `voiced_range` des Speakers eine ffmpeg-Overlay-Maske mit einem Closed-Mouth-Referenzframe drüberlegen.
- Aufwand größer (ffmpeg-Filter-Graph, Performance-Hit).
- Nur als Plan B beschreiben — nicht implementieren, solange Stufe A funktioniert.

## Frozen Invariants (unverändert)
- `LOCKED static camera` bleibt verbatim.
- Anti-Split-Screen Negatives bleiben.
- Framing-Change Negatives bleiben (FROZEN-INVARIANTS.md I.4).
- Sync.so Payload-Format unverändert (`sync_mode: cut_off`, deterministische ASD).
- v170-Pass-Skeleton-Seeding bleibt unverändert.

## Geänderte Dateien
- `supabase/functions/compose-video-clips/index.ts` (3 Stellen, ~25 LOC)

## Risiko & Rollback
- Risiko: Sync-3 könnte bei vollständig geschlossenen Plate-Mündern wieder „input unchanged" zurückgeben (v112-Regression).
- Mitigation: Aktiver Sprecher behält explizit „lip-ready" Geometrie (Lippen weich, sichtbar, unverdeckt) — nur **Bewegung** wird verboten. Sync.so braucht keine Plate-Bewegung, sondern eine **animierbare Mundregion**.
- Rollback: Ein einziger Git-Revert auf `compose-video-clips/index.ts` reicht; v112-Original bleibt in Kommentaren erhalten.
