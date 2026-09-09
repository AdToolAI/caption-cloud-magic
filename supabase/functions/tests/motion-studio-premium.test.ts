import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  isMotionStudioEntitled,
  isMotionStudioTestUser,
  MOTION_STUDIO_PREMIUM_REQUIRED,
  motionStudioPremiumDeniedResponse,
} from "../_shared/motion-studio-premium.ts";

function adminWithProfile(profile: Record<string, unknown> | null) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: profile }) }),
      }),
    }),
  };
}

const noEnv = (_k: string) => undefined;

Deno.test("free user cannot use Motion Studio", async () => {
  const entitled = await isMotionStudioEntitled(
    adminWithProfile({ plan: "free", account_type: "standard" }) as any,
    "u1",
    noEnv,
  );
  assertEquals(entitled, false);
});

Deno.test("creator account can use Motion Studio", async () => {
  const entitled = await isMotionStudioEntitled(
    adminWithProfile({ account_type: "creator" }) as any,
    "u2",
    noEnv,
  );
  assertEquals(entitled, true);
});

Deno.test("paid test-mode plan can use Motion Studio", async () => {
  const entitled = await isMotionStudioEntitled(
    adminWithProfile({ test_mode_plan: "basic" }) as any,
    "u3",
    noEnv,
  );
  assertEquals(entitled, true);
});

Deno.test("out-of-band plan without stripe customer is entitled", async () => {
  const entitled = await isMotionStudioEntitled(
    adminWithProfile({ plan: "basic", stripe_customer_id: null }) as any,
    "u4",
    noEnv,
  );
  assertEquals(entitled, true);
});

Deno.test("explicit test user override is entitled", async () => {
  const env = (k: string) => k === "VIDEO_ENHANCE_TEST_USER_IDS" ? "u5" : undefined;
  assertEquals(isMotionStudioTestUser(env, "u5"), true);
  const entitled = await isMotionStudioEntitled(adminWithProfile(null) as any, "u5", env);
  assertEquals(entitled, true);
});

Deno.test("missing profile is not entitled", async () => {
  const entitled = await isMotionStudioEntitled(adminWithProfile(null) as any, "u6", noEnv);
  assertEquals(entitled, false);
});

Deno.test("denied response is a structured 403", async () => {
  const res = motionStudioPremiumDeniedResponse({});
  assertEquals(res.status, 403);
  const body = await res.json();
  assertEquals(body.code, MOTION_STUDIO_PREMIUM_REQUIRED);
});
