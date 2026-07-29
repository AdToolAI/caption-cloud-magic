// Autopilot billing helper.
//
// Charges happen per stage (anchor, motion, voice, music) against
// `ai_video_wallets`, never as one lump sum up front. Every charge carries a
// deterministic idempotency key in its description, so a retried scene can
// never bill twice. Failed stages are refunded — the platform's credit
// reliability rule applies to the autopilot path as well.
//
// Note: lip-sync (`lip-sync-video`) and the final Lambda render
// (`render-with-remotion`) bill and refund themselves against the media
// wallet. They are deliberately NOT charged here to avoid double billing.

export type AutopilotStage = "anchor" | "motion" | "voice" | "music" | "sfx";

interface ChargeArgs {
  userId: string;
  productionId: string;
  stage: AutopilotStage;
  sceneIndex?: number | null;
  euros: number;
  label: string;
}

// deno-lint-ignore no-explicit-any
type Admin = any;

function key(productionId: string, stage: string, sceneIndex?: number | null): string {
  return `autopilot:${productionId}:${stage}:${sceneIndex ?? "film"}`;
}

export async function getWalletEuros(admin: Admin, userId: string): Promise<number> {
  const { data } = await admin
    .from("ai_video_wallets")
    .select("balance_euros")
    .eq("user_id", userId)
    .maybeSingle();
  return Number(data?.balance_euros ?? 0);
}

/**
 * Deduct one stage. Returns `charged: false` when the stage was already billed
 * (idempotent retry) or when the amount rounds to zero.
 */
export async function chargeStage(
  admin: Admin,
  args: ChargeArgs,
): Promise<{ charged: boolean; reason?: "already_charged" | "insufficient" | "zero"; balance: number }> {
  const amount = Math.round(Math.max(0, args.euros) * 100) / 100;
  const idem = key(args.productionId, args.stage, args.sceneIndex);

  if (amount <= 0) {
    return { charged: false, reason: "zero", balance: await getWalletEuros(admin, args.userId) };
  }

  const { data: existing } = await admin
    .from("ai_video_transactions")
    .select("id")
    .eq("user_id", args.userId)
    .eq("type", "deduction")
    .ilike("description", `${idem}%`)
    .limit(1);

  if (existing && existing.length > 0) {
    return { charged: false, reason: "already_charged", balance: await getWalletEuros(admin, args.userId) };
  }

  const { data: wallet } = await admin
    .from("ai_video_wallets")
    .select("balance_euros, currency")
    .eq("user_id", args.userId)
    .maybeSingle();

  const balance = Number(wallet?.balance_euros ?? 0);
  if (!wallet || balance < amount) {
    return { charged: false, reason: "insufficient", balance };
  }

  const newBalance = Math.round((balance - amount) * 100) / 100;

  await admin
    .from("ai_video_wallets")
    .update({ balance_euros: newBalance, updated_at: new Date().toISOString() })
    .eq("user_id", args.userId);

  await admin.from("ai_video_transactions").insert({
    user_id: args.userId,
    currency: wallet.currency ?? "EUR",
    type: "deduction",
    amount_euros: -amount,
    balance_after: newBalance,
    description: `${idem} — ${args.label}`,
  });

  await bumpSpent(admin, args.productionId, amount, 0);

  return { charged: true, balance: newBalance };
}

/** Give a stage's money back — used whenever a paid stage did not deliver. */
export async function refundStage(
  admin: Admin,
  args: ChargeArgs,
): Promise<boolean> {
  const amount = Math.round(Math.max(0, args.euros) * 100) / 100;
  if (amount <= 0) return false;

  const idem = key(args.productionId, args.stage, args.sceneIndex);

  const { data: charged } = await admin
    .from("ai_video_transactions")
    .select("id")
    .eq("user_id", args.userId)
    .eq("type", "deduction")
    .ilike("description", `${idem}%`)
    .limit(1);
  if (!charged || charged.length === 0) return false;

  const { data: already } = await admin
    .from("ai_video_transactions")
    .select("id")
    .eq("user_id", args.userId)
    .eq("type", "refund")
    .ilike("description", `${idem}%`)
    .limit(1);
  if (already && already.length > 0) return false;

  const { data: wallet } = await admin
    .from("ai_video_wallets")
    .select("balance_euros, currency")
    .eq("user_id", args.userId)
    .maybeSingle();
  if (!wallet) return false;

  const newBalance = Math.round((Number(wallet.balance_euros ?? 0) + amount) * 100) / 100;

  await admin
    .from("ai_video_wallets")
    .update({ balance_euros: newBalance, updated_at: new Date().toISOString() })
    .eq("user_id", args.userId);

  await admin.from("ai_video_transactions").insert({
    user_id: args.userId,
    currency: wallet.currency ?? "EUR",
    type: "refund",
    amount_euros: amount,
    balance_after: newBalance,
    description: `${idem} — Erstattung: ${args.label}`,
  });

  await bumpSpent(admin, args.productionId, -amount, amount);
  return true;
}

async function bumpSpent(admin: Admin, productionId: string, spentDelta: number, refundDelta: number) {
  const { data } = await admin
    .from("autopilot_productions")
    .select("spent_credits, refunded_credits")
    .eq("id", productionId)
    .maybeSingle();
  if (!data) return;

  const spent = Math.max(0, Number(data.spent_credits ?? 0) + spentDelta * 100);
  const refunded = Math.max(0, Number(data.refunded_credits ?? 0) + refundDelta * 100);

  await admin
    .from("autopilot_productions")
    .update({ spent_credits: Math.round(spent), refunded_credits: Math.round(refunded) })
    .eq("id", productionId);
}

/** Sell prices, mirroring src/lib/autopilot/costEstimate.ts. */
export const AUTOPILOT_PRICE = {
  anchorImage: 0.04,
  motionPerSecond: 0.23,
  voicePerSecond: 0.012,
  music: 0.18,
  /** One generated audio layer (foley hit or ambience bed). */
  sfxPerClip: 0.05,
} as const;
