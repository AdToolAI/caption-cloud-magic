/**
 * v427 — Rollout brakes (Phase 0).
 *
 * Every v427 behaviour change hangs on one of these flags. Default is always
 * the v426 legacy behaviour, so a deploy alone can never move the lip-sync
 * chain. Values live in `system_config` and accept the same shapes as the
 * v418 flag: `true` / `false`, `{ "enabled": true }`, `{ "user_ids": [...] }`.
 *
 * `v427.callback_guard_mode` is a tri-state string: "off" | "observe" | "enforce".
 *
 * The lip-sync feature freeze stays in force: with every flag at its default
 * the runtime behaviour is byte-identical to v426.
 */

export const V427_RUN_CONTRACT_VERSION = 427;

export type V427FlagKey =
  | "v427.pipeline_jobs_dual_write"
  | "v427.audio_preflight"
  | "v427.credit_reservations"
  | "v427.ready_semantics"
  | "v427.provider_leases";

export type CallbackGuardMode = "off" | "observe" | "enforce";

const CALLBACK_GUARD_KEY = "v427.callback_guard_mode";
const TTL_MS = 30_000;

const cache = new Map<string, { value: unknown; ts: number }>();

async function readConfig(admin: any, key: string): Promise<unknown> {
  const hit = cache.get(key);
  const now = Date.now();
  if (hit && now - hit.ts < TTL_MS) return hit.value;
  let raw: unknown = null;
  try {
    const { data } = await admin
      .from("system_config")
      .select("value")
      .eq("key", key)
      .maybeSingle();
    raw = data?.value ?? null;
  } catch {
    raw = null;
  }
  cache.set(key, { value: raw, ts: now });
  return raw;
}

function resolveBool(raw: unknown, userId?: string | null): boolean {
  if (raw === null || raw === undefined) return false;
  if (typeof raw === "boolean") return raw;
  if (typeof raw === "string") return raw.toLowerCase() === "true";
  if (typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    if (obj.enabled === true) return true;
    const ids = Array.isArray(obj.user_ids) ? obj.user_ids.map(String) : [];
    return !!userId && ids.includes(String(userId));
  }
  return false;
}

/** Default OFF — legacy v426 behaviour. */
export async function isV427FlagEnabled(
  admin: any,
  flag: V427FlagKey,
  userId?: string | null,
): Promise<boolean> {
  return resolveBool(await readConfig(admin, flag), userId);
}

/** Default "off" — the guard neither logs nor rejects. */
export async function getCallbackGuardMode(
  admin: any,
  userId?: string | null,
): Promise<CallbackGuardMode> {
  const raw = await readConfig(admin, CALLBACK_GUARD_KEY);
  let mode: string | null = null;
  if (typeof raw === "string") mode = raw;
  else if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    if (typeof obj.mode === "string") mode = obj.mode;
    const ids = Array.isArray(obj.user_ids) ? obj.user_ids.map(String) : [];
    if (ids.length > 0 && !(userId && ids.includes(String(userId)))) {
      // Scoped rollout: accounts outside the list stay on legacy behaviour.
      mode = typeof obj.fallback_mode === "string" ? obj.fallback_mode : "off";
    }
  }
  return mode === "observe" || mode === "enforce" ? mode : "off";
}

/** Test seam. */
export function __resetV427FlagCache(): void {
  cache.clear();
}
