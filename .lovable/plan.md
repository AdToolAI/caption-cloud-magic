# V537 Fence Assumptions — Read-Only Source Report

No files were changed, nothing deployed.

## 1) Canonical identifiers in `supabase/functions/compose-dialog-segments/index.ts`

### Definitions (lines 1070–1092)

```ts
1071:    const plan = ((scene as any).audio_plan ?? {}) as Record<string, any>;
1072:    const twoshot = (plan.twoshot ?? {}) as Record<string, any>;
1073:    const speakers = (Array.isArray(twoshot.speakers) ? twoshot.speakers : []) as TwoshotSpeaker[];
1076:    let canonicalDialogTurnsCount = 0;
1077:    let canonicalSpeakerIds: string[] = [];
1078:    let speakersSource = "audio_plan";
1080:    let canonicalDialogTurnIds: string[] = [];
1082:    if (await readIdOnlyEnabled(supabase)) {
1083:      const ensuredTurns = await ensureDialogTurnsForScene(supabase, scene as any);
1084:      if (ensuredTurns.ok) {
1085:        canonicalDialogTurnsCount = ensuredTurns.turns.length;
1086:        canonicalSpeakerIds = orderedSpeakerIdsFromTurns(ensuredTurns.turns);
1087:        canonicalDialogTurnIds = ensuredTurns.turns
1088:          .map((t) => (typeof t.turnId === "string" ? t.turnId.trim() : ""))
1089:          .filter((id) => id.length > 0);
1090:        speakersSource = "dialog_turns";
```

All four derive from ONE read: `ensureDialogTurnsForScene(scene)` over the live `composer_scenes.dialog_turns` row loaded at request entry.

### Uses

| Symbol | Use sites | Effect on this run |
|---|---|---|
| `canonicalDialogTurnIds` | 4347–4392 (FA-4/P0 guard) | Gate: `evaluateTurnPassBinding(builtPasses, canonicalDialogTurnIds)`; on mismatch → refund + `clip_error: fa4_p0_turn_pass_mismatch` + HTTP 422. Only non-empty arrays arm the guard (`.length > 0`). |
| `canonicalDialogTurnsCount` | 8992 (arming condition), 10260/10838 (telemetry only) | Only decides whether the cast check runs (`> 0`). Its numeric value is never compared against pass count. |
| `canonicalSpeakerIds` | 8994 (membership), 1107 (v202 log), 9004/10840 (telemetry) | Gate: every pass's `character_id` must be in this set, else `id_only_cast_violation` 422. |
| `speakersSource` | 1090 set, 9002/10260/10838 telemetry only | No control flow. |

### Referent of the other side of both gates

The passes are built from the **audio-plan snapshot**, not from `dialog_turns`:

```ts
4115:    const builtPassesRaw: PassState[] = passSpeakers.map(({ sp, originalIdx }, passIdx) => {
4117:      const turns = sp.voicedRange!.turns! as Turn[];
4125:        turnId: t.turnId ? String(t.turnId) : null,
4134:        segment_id: passSegments.length === 1 ? (passSegments[0].turnId ?? null) : null,
4167:            segment_id: seg.turnId ?? null,
```

`sp` is a `TwoshotSpeaker` out of `plan.twoshot.speakers` (line 1073), so both `segment_id` (turn ids) and `pass.character_id` come from `audio_plan`.

### Answer to the fence question

- **Turn-ID axis:** today FA-4 compares audio-plan-derived `segment_id`s against live-`dialog_turns`-derived `canonicalDialogTurnIds` — a genuine cross-referent comparison, and exactly the shape of the N2-02 incident (plan segments hold ids; live `dialog_turns` lost ids 1–3). Overriding **only** `canonicalDialogTurnIds` from the same audio-plan snapshot makes both sides of the FA-4 guard temporally identical. That is internally consistent.
- **Speaker axis:** `canonicalSpeakerIds` remains a *different* comparison (plan `pass.character_id` ∈ live dialog_turns speakers). It is **not coupled** to turn ids: it is a set of `characterId`s produced by `orderedSpeakerIdsFromTurns` (`scene-dialog-turns.ts:164–174`), deduplicated and independent of `turnId` presence. A stale/edited `dialog_turns` that only strips or regenerates `turnId`s does not change this set, so freezing turn ids alone introduces no new inconsistency there. The residual (pre-existing, unchanged) risk is a genuine speaker **reassignment** between plan build and dispatch, which would reject a plan pass — that behaviour is the same before and after the V537 override.
- **Count axis:** `canonicalDialogTurnsCount` is used solely as a boolean arm (`> 0`) plus telemetry. Freezing turn ids while leaving the count live cannot create a pass/cast eligibility mismatch, because no code compares the count to `canonicalDialogTurnIds.length` or to pass count. The only edge case is asymmetric arming: live turns present but plan-derived ids empty (or vice versa) → one gate arms and the other does not. Both remain fail-closed-on-mismatch, never fail-open on identity.

Conclusion: overriding only `canonicalDialogTurnIds` is internally safe for pass/cast eligibility; `canonicalSpeakerIds`, `canonicalDialogTurnsCount` and `speakersSource` are independent and can stay live. Telemetry will then mix a frozen id list with live speakers/count — worth labelling in the observation payload.

## 2) Client persistence writes `audio_plan` — the fence is NOT sufficient alone

`src/hooks/useComposerPersistence.ts` writes `audio_plan` **unconditionally, in both the UPDATE and the INSERT branch**:

```ts
225:              audio_plan: (scene.audioPlan ?? null) as any,   // UPDATE branch
291:              audio_plan: (scene.audioPlan ?? null) as any,   // INSERT branch
```

Same payload also writes `dialog_turns: ((scene as any).dialogTurns ?? []) as any` (lines 207 / 273). There is no conditional/omit logic and no merge — it is a full column overwrite, and a client whose in-memory `scene.audioPlan` is undefined writes **NULL** over the server-built plan.

Hydration does defend partially: `VideoComposerDashboard.tsx:497` and `:695` map `audioPlan: ((row as any).audio_plan as any) ?? local?.audioPlan`, i.e. DB wins on load. But any persist that fires from a snapshot taken before the server wrote the plan will still clobber it.

Consequence for V537: freezing `canonical_turn_ids` *inside* `audio_plan` does not fence the race, because the same client save path can overwrite or null the whole `audio_plan` object. A durable fence needs either a column the client never writes, or removal/conditional-omission of `audio_plan` (and ideally `dialog_turns`) from the client payload.

## 3) `compose-twoshot-audio` writes `dialog_turns` and `audio_plan` in TWO separate UPDATEs

Canonicalization write (`supabase/functions/compose-twoshot-audio/index.ts:752–773`):

```ts
752:        const persistPayload = effective.turns.map((t, i) => ({ turnId: t.turnId, characterId: t.characterId, ... }));
760:        const { error: persistErr } = await supabase
761:          .from("composer_scenes")
762:          .update({ dialog_turns: persistPayload, updated_at: new Date().toISOString() })
763:          .eq("id", scene_id);
```

Audio-plan write, much later, after TTS/merge (lines 1496–1556):

```ts
1497:    const sceneUpdate: Record<string, unknown> = {
1498:      character_audio_url: publicUrl,
1499:      audio_plan: { ...latestAudioPlan, twoshot: { ...latestTwoshot, segments: publicSegments, speakers: publicSpeakerTracks, ... } },
1524:      updated_at: new Date().toISOString(),
1525:    };
1553:    await supabase.from("composer_scenes").update(sceneUpdate).eq("id", scene_id);
```

So: not atomic. Between the two writes the row carries canonicalized `dialog_turns` with a stale `audio_plan`, and any concurrent client save (section 2) or further canonicalization can land in that window. Note also the v277 re-read at 1481–1493 refreshes `audio_plan` before writing but does **not** re-read `dialog_turns`.

## Bottom line

1. Freezing only `canonicalDialogTurnIds` from the audio-plan snapshot is internally coherent; the other three values do not affect the same run's pass/cast eligibility beyond a boolean arm and telemetry.
2. Storing the freeze inside `audio_plan` is not a real fence while `useComposerPersistence` writes `audio_plan` unconditionally.
3. The server's `dialog_turns` and `audio_plan` writes are two separate, non-atomic UPDATEs.
