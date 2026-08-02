/**
 * assignment-lock.test.ts (v387) — Kanonischer Sprecher-Lock.
 *
 * Regressionsschutz für `lipsync_identity_collision`: ein persistierter Lock
 * mit 5 Slots darf eine Szene mit 4 klar getrennten Sprechern nicht mehr
 * abschiessen.
 *
 * Run: deno test supabase/functions/_shared/assignment-lock.test.ts
 */

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { canonicalizeAssignmentLock } from "./assignment-lock.ts";

const SAMUEL = "483f9cdc-eb31-4486-bf67-9c5e7d955016";
const MATTHEW = "54d90504-7253-482f-9c6f-1902e8a6749b";
const SARAH = "5c81f9bf-a5f1-4608-849f-e2a4adc84bcb";
const KAILEE = "4d543892-20f3-439f-ab79-16b68784747b";

Deno.test("stale 5th slot is dropped and does not create a collision", () => {
  const res = canonicalizeAssignmentLock(
    { "0": SAMUEL, "1": MATTHEW, "2": SARAH, "3": KAILEE, "4": SARAH },
    [SAMUEL, MATTHEW, SARAH, KAILEE],
  );
  assertEquals(Object.keys(res.lock).length, 4);
  assertEquals(res.droppedSlots, ["4"]);
  assertEquals(res.duplicateCharacterIds, []);
});

Deno.test("current speakers win over a stale persisted mapping", () => {
  const res = canonicalizeAssignmentLock(
    { "0": KAILEE, "1": KAILEE },
    [SAMUEL, MATTHEW],
  );
  assertEquals(res.lock, { "0": SAMUEL, "1": MATTHEW });
  assertEquals(res.duplicateCharacterIds, []);
});

Deno.test("a real duplicate speaker is still reported as a collision", () => {
  const res = canonicalizeAssignmentLock({}, [SARAH, SARAH]);
  assertEquals(res.duplicateCharacterIds, [SARAH]);
});

Deno.test("variant prefixes resolve to the base character", () => {
  const res = canonicalizeAssignmentLock({}, [`outfit:${SARAH}`, MATTHEW]);
  assertEquals(res.lock, { "0": SARAH, "1": MATTHEW });
});
