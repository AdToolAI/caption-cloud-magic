/**
 * v418 — Rollout brake for Seedance 2.5 as a lip-sync master-plate provider.
 *
 * The lip-sync chain has been under freeze since the surgical rollback, so a
 * new plate provider is opened one account at a time. The flag lives in
 * `system_config` under `composer.feature.seedance25_lipsync` and accepts:
 *
 *   true / false            → globally on / off
 *   { "enabled": true }     → globally on
 *   { "user_ids": ["…"] }   → on for those accounts only
 *
 * Default (row missing or unreadable): OFF.
 */

const CFG_KEY = "composer.feature.seedance25_lipsync";
const FLAG_TTL_MS = 30_000;

let _cache: { value: unknown; ts: number } | null = null;

export async function isSeedance25LipsyncEnabled(
  admin: any,
  userId?: string | null,
): Promise<boolean> {
  let raw: unknown = null;
  const now = Date.now();
  if (_cache && now - _cache.ts < FLAG_TTL_MS) {
    raw = _cache.value;
  } else {
    try {
      const { data } = await admin
        .from("system_config")
        .select("value")
        .eq("key", CFG_KEY)
        .maybeSingle();
      raw = data?.value ?? null;
    } catch {
      raw = null;
    }
    _cache = { value: raw, ts: now };
  }

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

/** Test seam — drops the 30s process cache. */
export function __resetSeedance25LipsyncFlagCache(): void {
  _cache = null;
}
