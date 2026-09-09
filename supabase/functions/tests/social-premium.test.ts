import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { isSocialPremiumEntitled, isSocialPremiumTestUser } from "../_shared/social-premium.ts";

function adminWith(profile: Record<string, unknown> | null) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: profile }) }),
      }),
    }),
  };
}

const noEnv = (_k: string) => undefined;

Deno.test("free user cannot create social connections", async () => {
  const admin = adminWith({ plan: "free", stripe_customer_id: null });
  assertEquals(await isSocialPremiumEntitled(admin, "u1", noEnv), false);
});

Deno.test("creator account is entitled", async () => {
  const admin = adminWith({ account_type: "creator", plan: "free" });
  assertEquals(await isSocialPremiumEntitled(admin, "u2", noEnv), true);
});

Deno.test("paid test-mode plan is entitled", async () => {
  const admin = adminWith({ test_mode_plan: "basic" });
  assertEquals(await isSocialPremiumEntitled(admin, "u3", noEnv), true);
});

Deno.test("out-of-band plan without stripe customer is entitled", async () => {
  const admin = adminWith({ plan: "basic", stripe_customer_id: null });
  assertEquals(await isSocialPremiumEntitled(admin, "u4", noEnv), true);
});

Deno.test("explicit test user override is entitled", async () => {
  const env = (k: string) => (k === "VIDEO_ENHANCE_TEST_USER_IDS" ? "u5" : undefined);
  assertEquals(isSocialPremiumTestUser(env, "u5"), true);
  assertEquals(await isSocialPremiumEntitled(adminWith(null), "u5", env), true);
});

Deno.test("missing profile is never entitled", async () => {
  assertEquals(await isSocialPremiumEntitled(adminWith(null), "u6", noEnv), false);
});
