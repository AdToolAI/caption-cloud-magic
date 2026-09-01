# RCA — `anchor_identity_needs_review: 3/4` on scene 67b392b1 (Gen33)

## 1. Exact blocking guard

`supabase/functions/compose-video-clips/index.ts:3963`

```ts
const v508StrictBlock = !v508Verify.ok;            // line 3944
const needsManualReview = v508StrictBlock || (softGateEnabled
  ? isTotalMiss                                    // 3/4 is NOT a total miss
  : (expected >= 3 && (!idAuthoritative.ok || resolved < expected)));
```

`V276_SOFT_GATE` defaults to `true` (line 3858), so the v276 branch does **not** block a 3/4 partial. The block comes exclusively from **V508 strict verification** (`_shared/v508-strict-identity.ts:331 evaluateStrictVerification`): every strict cast member must appear as a value inside `assignmentLock`; anything else is `evidenceClass: "unverified"` → `ok:false`. The persisted evidence confirms it:

```
strict_identity.reason = "strict_anchor_identity_unverified:Samuel Dusatko"
expected_strict 4 / resolved_strict 3, repair_attempted true
```

The status write (`clip_status: "awaiting_manual_face_map"` + `anchor_identity_needs_review` text) is at lines 3979–3985; provider dispatch is skipped at 3999. So no credits are burned — the block is pre-render by design.

## 2. Meaning of `assignmentLock` keys

`_shared/resolveIdentityViaRekognition.ts:643` — `assignmentLock[String(c.speakerIdx)] = c.characterId`.

Keys are **speaker indices** (cast/prompt order), **not** detected-face slots and **not** anchor layout slots. Face ownership lives separately in `plate_identity.faces[].characterId`, keyed by DetectFaces slot. `slot` in `strict_identity.evidence` is read back from the lock key, so it is a speaker index too — it does not name a face.

DetectFaces order itself is not meaningful: `detectFacesOnAnchor` (line 165) re-sorts the raw boxes row-major (top→bottom, then left→right) and renumbers `slot = i`. Ordering is therefore stable geometrically, but carries no identity.

## 3. v278 anchor layout — not identity-authoritative

`_shared/plateFaceSlotRouter.ts:220 buildAnchorLayoutFromV274`, line 239:

```ts
const characterId = fallbackCharacterIds[slotIndex] ?? f.characterId;
```

The layout takes its **geometry from the same v274 `faces` array** and its **characterId from prompt/speaker order by slot index**. It is not an independent authority: the "complete 4 slots with explicit characterId" is a positional assumption, and the anchor composer can and does reorder people. Current Gen33 proves it.

## 4. Geometric consistency for Gen33 (explicit)

Anchor dims 704×1520. Layout slots are byte-identical in geometry to the detected faces (they were derived from them), so the 4↔4 geometric match is trivially one-to-one:

| face slot | bbox (px) | v278 layout label (positional) | AWS biometric label | similarity |
|---|---|---|---|---|
| 0 | 112,287–197,433 | Sarah `5c81f9bf` | **Matthew `54d90504`** | 93.46 |
| 1 | 187,484–249,567 | Samuel `483f9cdc` | **Sarah `5c81f9bf`** | 83.21 |
| 2 | 522,349–611,489 | Matthew `54d90504` | **null** | – |
| 3 | 432,607–503,696 | Kay `c65de5c6` | **Kay `c65de5c6`** | 99.27 |

Verdict: the layout labels **contradict** biometrics on slots 0, 1 and 2 — three of four. Using layout geometry as an identity source would have mis-routed Matthew's and Sarah's audio. Geometry is one-to-one; the *labels attached to that geometry* are wrong. The three AWS assignments are mutually consistent (injective, high similarity) and are the trustworthy part.

By pure elimination: three characters are biometrically pinned to faces 0, 1, 3; exactly one face (slot 2) and exactly one character (Samuel `483f9cdc`) remain. detected=4, expected=4, no ambiguity, no competing claim.

## 5. Root cause

Two separate things, only one of them a bug:

- **Real cause of the miss:** Samuel's portrait never clears MIN_SIMILARITY 55 (nor pass-2 45) against his face on this anchor — pose/angle/lighting on slot 2. Nothing in the pipeline is broken there; Rekognition simply refuses.
- **Real cause of the recurring hard block:** V508 accepts *only* direct biometric acceptance as evidence. A logically forced identity — the single remaining face for the single remaining character, in a saturated 4/4 detection — is unrepresentable, so it is classified `unverified` and fails closed. The targeted repair (`repair_attempted: true`) re-rolls the anchor, gets a new pose, and the same coin flip repeats.
- **Aggravating factor:** v278 looks like a deterministic authority in the payload (`v278AnchorLayoutComplete: true`) but is positional and, here, wrong. It must not be promoted into the identity path.

## 6. Why it recurs every generation

Each regeneration composes a fresh anchor with a fresh pose for Samuel. The pass fails whenever his face lands below 55/45 — a per-generation probability, not a persistent state. Nothing carries a successful earlier match forward, and the strict gate has no way to accept a forced deduction, so any generation where one strict member is slightly off-angle blocks again.

## 7. Minimal safe fix class (design only)

**Class:** add one new *derived* evidence class — "closure by exhaustive elimination" — to V508. No threshold change, no Gemini/Nano Banana, no geometry-as-identity, no bypass.

Admit exactly one deduced assignment when **all** hold:

1. `detectedCount === expectedCount` (saturated detection).
2. `resolvedCount === expectedCount - 1` (exactly one gap).
3. Exactly one detected face has `characterId === null`.
4. Exactly one requested character is absent from `assignmentLock`.
5. That character's diagnostic reason is `below_threshold` / `ambiguous`-free of contradiction: it must **not** be `portrait_load_failed`, `compare_failed`, `no_faces_detected` or `assignment_budget_exceeded` (those prove nothing was measured).
6. The missing character's best-scoring face is either the leftover face or has a score below every accepted edge — i.e. no evidence that it belongs to an already-claimed face.
7. All accepted edges are injective and above their thresholds (already guaranteed by the resolver).

Then set `plate_identity.faces[leftover].characterId`, `assignmentLock[speakerIdx]`, mark that slot `evidenceClass: "deduced_closure"`, `assignmentLockSource: "v274_anchor_rekognition_closure"`, and let V508 treat `deduced_closure` as satisfying strict for **that one slot only**. Two or more gaps → unchanged hard block.

Touched files (implementation stage, not now): `_shared/v508-strict-identity.ts` (new evidence class + closure evaluator, pure), a new pure `_shared/v534-identity-closure.ts`, and the single call site in `compose-video-clips/index.ts` between the resolver result and `evaluateStrictVerification`. Nothing in V523/V524/V529/V530/V531/V532/V533, `compose-dialog-segments`, or Sync.so is touched.

### Safety invariants

- Never fires with ≥2 unresolved characters.
- Never fires when `detectedCount !== expectedCount`.
- Never fires on a resolver-failure reason (load/compare/budget/zero-faces).
- Never overwrites an accepted biometric edge.
- Never reads v278 layout `characterId`.
- Thresholds 55/45 untouched; the closure is a *set* argument, not a score argument.
- Fully recorded in telemetry so a wrong closure is auditable after the fact.

## 8. Regression matrix

| case | detected | resolved | expectation |
|---|---|---|---|
| Gen33 shape | 4 | 3, one null face, one missing char | closure fires, Samuel → face slot 2, no block |
| two gaps | 4 | 2 | unchanged hard block |
| under-detection | 3 | 3 of 4 | unchanged hard block (rule 1) |
| over-detection | 5 | 3 | unchanged hard block |
| missing char reason `portrait_load_failed` | 4 | 3 | unchanged hard block |
| missing char reason `assignment_budget_exceeded` | 4 | 3 | unchanged hard block |
| missing char best face is an already-claimed face at high score | 4 | 3 | unchanged hard block (contradiction) |
| full 4/4 | 4 | 4 | untouched path, no closure record |
| total miss 0/4 | 4 | 0 | unchanged `isTotalMiss` block |
| non-strict cast | any | partial | unchanged v276 soft-gate behaviour |
| v278 layout contradicts biometrics | 4 | 3 | closure ignores layout labels entirely |

Plus frozen-contract assertions: MIN_SIMILARITY stays 55/45; `STRICT_EVIDENCE_CLASSES` still excludes positional/geometric; `assignmentLock` keys remain speaker indices.

## 9. Manual face map

Yes — keep it. It stays the fallback for every case the closure refuses (≥2 gaps, count mismatch, contradiction, resolver failure). The closure only removes the one case that is logically forced and currently costs the user a full regeneration cycle.

No code was changed, nothing deployed, no DB writes.
