import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  isPictureStudioPremiumEntitled,
  isPremiumEnhanceModel,
  isSpecialistTier,
} from "../_shared/picture-studio-premium.ts";

const adminWithProfile = (profile: Record<string, unknown> | null) => ({
  from: () => ({
    select: () => ({
      eq: () => ({
        maybeSingle: () => Promise.resolve({ data: profile }),
      }),
    }),
  }),
});

const noEnv = () => undefined;

Deno.test("core tiers are never premium", () => {
  for (const tier of ["standard", "gptimage", "ideogram", "recraft", "qwen"]) {
    assertEquals(isSpecialistTier(tier), false);
  }
});

Deno.test("specialist tiers are premium", () => {
  for (const tier of ["fast", "pro", "ultra", "flux"]) {
    assertEquals(isSpecialistTier(tier), true);
  }
});

Deno.test("Clarity is free, Topaz is premium", () => {
  assertEquals(isPremiumEnhanceModel("clarity-pro"), false);
  assertEquals(isPremiumEnhanceModel("topaz-image-upscale"), true);
  assertEquals(isPremiumEnhanceModel("topaz-dust-scratch"), true);
  assertEquals(isPremiumEnhanceModel("topaz-colorization"), true);
});

Deno.test("free user is not entitled", async () => {
  const entitled = await isPictureStudioPremiumEntitled(
    adminWithProfile({ account_type: "standard", plan: "free", test_mode_plan: null, stripe_customer_id: null }),
    "user-1",
    noEnv,
  );
  assertEquals(entitled, false);
});

Deno.test("creator account is entitled", async () => {
  const entitled = await isPictureStudioPremiumEntitled(
    adminWithProfile({ account_type: "creator", plan: "free", test_mode_plan: null, stripe_customer_id: null }),
    "user-2",
    noEnv,
  );
  assertEquals(entitled, true);
});

Deno.test("test-mode plan is entitled", async () => {
  const entitled = await isPictureStudioPremiumEntitled(
    adminWithProfile({ account_type: "standard", plan: "free", test_mode_plan: "basic", stripe_customer_id: null }),
    "user-3",
    noEnv,
  );
  assertEquals(entitled, true);
});

Deno.test("explicit test user override is entitled", async () => {
  const entitled = await isPictureStudioPremiumEntitled(
    adminWithProfile({ account_type: "standard", plan: "free", test_mode_plan: null, stripe_customer_id: null }),
    "user-4",
    (key) => (key === "VIDEO_ENHANCE_TEST_USER_IDS" ? "user-4,user-9" : undefined),
  );
  assertEquals(entitled, true);
});
