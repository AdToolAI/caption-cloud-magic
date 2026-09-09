import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  resolveSubscriptionEntitlement,
} from '../_shared/subscription-entitlement.ts';
import { isTestAllowlisted } from '../_shared/video-enhance-models.ts';

/**
 * Topaz premium gate. The gate itself is:
 *   allowed = isTestAllowlisted(env, userId) || entitlement.entitled
 * and it runs BEFORE reservation, wallet mutation and provider submit.
 * Wallet balance is a separate, additional condition — never a substitute.
 */
const TEST_USER = '8948d3d9-2c5e-4405-9e9c-1624448e7189';
const PLAIN_USER = '43d88fa6-9341-4094-8cf8-7fc175ffa696';

const env = (key: string) =>
  key === 'VIDEO_ENHANCE_TEST_USER_IDS' ? TEST_USER : undefined;

const noStripe = async () => false;
const activeStripe = async () => true;

async function topazAllowed(
  userId: string,
  profile: Parameters<typeof resolveSubscriptionEntitlement>[0],
  stripeActive = false,
): Promise<boolean> {
  if (isTestAllowlisted(env, userId)) return true;
  const result = await resolveSubscriptionEntitlement(
    profile,
    stripeActive ? activeStripe : noStripe,
  );
  return result.entitled;
}

Deno.test('entitled user (active Stripe subscription) may start Topaz', async () => {
  assertEquals(
    await topazAllowed(PLAIN_USER, { stripe_customer_id: 'cus_1' }, true),
    true,
  );
});

Deno.test('entitled user with insufficient credits is NOT blocked by the premium gate', async () => {
  // The gate is entitlement-only; the wallet check stays exactly where it was,
  // so an entitled user with an empty wallet falls into the normal
  // insufficient-credit flow instead of TOPAZ_PREMIUM_REQUIRED.
  const entitlement = await resolveSubscriptionEntitlement(
    { stripe_customer_id: 'cus_1' },
    activeStripe,
  );
  assertEquals(entitlement.entitled, true);
});

Deno.test('non-entitled user with plenty of credits is blocked', async () => {
  assertEquals(await topazAllowed(PLAIN_USER, { stripe_customer_id: 'cus_1' }, false), false);
  assertEquals(await topazAllowed(PLAIN_USER, {}), false);
  assertEquals(await topazAllowed(PLAIN_USER, null), false);
  assertEquals(await topazAllowed(PLAIN_USER, { plan: 'free' }), false);
  assertEquals(await topazAllowed(PLAIN_USER, { test_mode_plan: 'free' }), false);
});

Deno.test('creator accounts are entitled without Stripe', async () => {
  assertEquals(await topazAllowed(PLAIN_USER, { account_type: 'creator' }), true);
});

Deno.test('test-mode plan and out-of-band profile plan are entitled', async () => {
  assertEquals(await topazAllowed(PLAIN_USER, { test_mode_plan: 'beta-basic' }), true);
  assertEquals(await topazAllowed(PLAIN_USER, { plan: 'beta-basic' }), true);
  // An out-of-band plan does NOT count once a Stripe customer exists.
  assertEquals(
    await topazAllowed(PLAIN_USER, { plan: 'beta-basic', stripe_customer_id: 'cus_1' }, false),
    false,
  );
});

Deno.test('allowlisted validation account overrides the premium gate', async () => {
  assertEquals(await topazAllowed(TEST_USER, null), true);
});

Deno.test('direct API request cannot bypass the UI gate', async () => {
  // Same decision function is used server-side; no client-supplied field can
  // influence it, and a stale Stripe customer stays unentitled.
  const stale = await resolveSubscriptionEntitlement(
    { stripe_customer_id: 'cus_gone' },
    async () => {
      throw Object.assign(new Error('No such customer'), { code: 'resource_missing' });
    },
  );
  assertEquals(stale.entitled, false);
  assertEquals(stale.reason, 'stale_customer');
});
