import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { isTextStudioTestUser } from "../_shared/text-studio-premium.ts";
import { resolveSubscriptionEntitlement } from "../_shared/subscription-entitlement.ts";

// The Text Studio gate consults exactly ONE truth source: the same entitlement
// rules Topaz / vCube Premium use. These tests pin that behaviour.

Deno.test("free user is not entitled", async () => {
  const r = await resolveSubscriptionEntitlement({ plan: "free", stripe_customer_id: null });
  assertEquals(r.entitled, false);
});

Deno.test("paid Stripe subscriber is entitled", async () => {
  const r = await resolveSubscriptionEntitlement(
    { plan: "free", stripe_customer_id: "cus_1" },
    async () => true,
  );
  assertEquals(r.entitled, true);
});

Deno.test("creator account is entitled", async () => {
  const r = await resolveSubscriptionEntitlement({ account_type: "creator" });
  assertEquals(r.entitled, true);
});

Deno.test("test-mode plan entitles, test-mode free does not", async () => {
  assertEquals((await resolveSubscriptionEntitlement({ test_mode_plan: "pro" })).entitled, true);
  assertEquals((await resolveSubscriptionEntitlement({ test_mode_plan: "free" })).entitled, false);
});

Deno.test("out-of-band plan without Stripe customer is entitled", async () => {
  const r = await resolveSubscriptionEntitlement({ plan: "pro", stripe_customer_id: null });
  assertEquals(r.entitled, true);
});

Deno.test("explicit test user override", () => {
  const env = (k: string) => (k === "VIDEO_ENHANCE_TEST_USER_IDS" ? "u-1, u-2" : undefined);
  assertEquals(isTextStudioTestUser(env, "u-2"), true);
  assertEquals(isTextStudioTestUser(env, "u-9"), false);
  assertEquals(isTextStudioTestUser(() => undefined, "u-1"), false);
});
