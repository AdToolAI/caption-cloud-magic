/**
 * asset-ref
 * =============================================================================
 * v202 — Canonical Cast & World asset references.
 *
 * Every downstream pipeline (compose-video-clips, compose-dialog-segments,
 * render-directors-cut, briefing-deep-parse) should reference Cast & World
 * assets through this single value type. The intent is to eliminate name /
 * slug matching everywhere and rely on real DB IDs (`brand_characters.id`,
 * `brand_locations.id`, …).
 *
 * Storage: `composer_scenes.scene_assets jsonb` — an array of AssetRef.
 * If the column is empty for a scene, `ensureSceneAssetsForScene()` performs
 * a just-in-time backfill from the legacy columns (`character_shots`,
 * `mentioned_location_ids`, `applied_style_preset_id`) and — if it can be
 * resolved unambiguously — persists it back.
 *
 * Gate: feature flag `composer.feature.scene_assets_required` in
 * `system_config` (default `false`). When true, callers should hard-fail
 * on `pending`/unresolved refs instead of silently continuing.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

export type AssetType = "character" | "location" | "building" | "prop" | "style";

export type AssetRef = {
  type: AssetType;
  id: string;
  variantId?: string | null;
  role?: string | null;
  displayName?: string | null;
};

export type ResolvedAsset = AssetRef & {
  referenceImageUrl: string | null;
  canonicalName: string | null;
  voiceId?: string | null;
  sourceTable: string;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}

function admin() {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );
}

// ─── Feature flag ───────────────────────────────────────────────────────────
let cachedRequiredFlag: boolean | null = null;
export async function readSceneAssetsRequired(): Promise<boolean> {
  if (cachedRequiredFlag !== null) return cachedRequiredFlag;
  try {
    const { data } = await admin()
      .from("system_config")
      .select("value")
      .eq("key", "composer.feature.scene_assets_required")
      .maybeSingle();
    const v = (data as any)?.value;
    cachedRequiredFlag = v === true || v === "true";
  } catch {
    cachedRequiredFlag = false;
  }
  return cachedRequiredFlag;
}

// ─── Sanitize inbound array ─────────────────────────────────────────────────
export function sanitizeSceneAssets(input: unknown): AssetRef[] {
  if (!Array.isArray(input)) return [];
  const out: AssetRef[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const type = String(r.type ?? "").toLowerCase() as AssetType;
    if (!["character", "location", "building", "prop", "style"].includes(type)) continue;
    if (!isUuid(r.id)) continue;
    out.push({
      type,
      id: String(r.id),
      variantId: isUuid(r.variantId) ? String(r.variantId) : null,
      role: typeof r.role === "string" && r.role ? r.role : null,
      displayName:
        typeof r.displayName === "string" && r.displayName ? r.displayName : null,
    });
  }
  // Dedupe by (type,id,variantId)
  const seen = new Set<string>();
  return out.filter((a) => {
    const k = `${a.type}::${a.id}::${a.variantId ?? ""}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

// ─── JIT backfill from legacy scene columns ─────────────────────────────────
export type EnsureSceneAssetsResult = {
  refs: AssetRef[];
  source: "existing" | "jit_backfill" | "empty";
  persisted: boolean;
};

export async function ensureSceneAssetsForScene(sceneId: string): Promise<
  EnsureSceneAssetsResult
> {
  const sb = admin();
  const { data: scene, error } = await sb
    .from("composer_scenes")
    .select(
      "id, scene_assets, character_shots, mentioned_location_ids, applied_style_preset_id",
    )
    .eq("id", sceneId)
    .maybeSingle();

  if (error || !scene) {
    return { refs: [], source: "empty", persisted: false };
  }

  const existing = sanitizeSceneAssets((scene as any).scene_assets);
  if (existing.length > 0) {
    return { refs: existing, source: "existing", persisted: false };
  }

  const refs: AssetRef[] = [];

  // Characters from character_shots[]
  const shots = Array.isArray((scene as any).character_shots)
    ? ((scene as any).character_shots as any[])
    : [];
  const charSeen = new Set<string>();
  for (const s of shots) {
    const cid = s?.characterId;
    if (!isUuid(cid) || charSeen.has(cid)) continue;
    charSeen.add(cid);
    refs.push({
      type: "character",
      id: cid,
      role: typeof s?.role === "string" && s.role ? s.role : null,
      displayName:
        typeof s?.displayName === "string" && s.displayName
          ? s.displayName
          : typeof s?.name === "string" && s.name
            ? s.name
            : null,
    });
  }

  // Location: first mentioned_location_ids
  const locIds = Array.isArray((scene as any).mentioned_location_ids)
    ? ((scene as any).mentioned_location_ids as string[])
    : [];
  const firstLoc = locIds.find((v) => isUuid(v));
  if (firstLoc) {
    refs.push({ type: "location", id: firstLoc, role: "backdrop" });
  }

  // Style preset
  const styleId = (scene as any).applied_style_preset_id;
  if (isUuid(styleId)) {
    refs.push({ type: "style", id: styleId });
  }

  if (refs.length === 0) {
    return { refs: [], source: "empty", persisted: false };
  }

  // Persist best-effort — safe even under concurrent updates because we only
  // write when the column was empty.
  let persisted = false;
  try {
    const { error: upErr } = await sb
      .from("composer_scenes")
      .update({ scene_assets: refs, updated_at: new Date().toISOString() })
      .eq("id", sceneId)
      .or("scene_assets.is.null,scene_assets.eq.[]");
    persisted = !upErr;
  } catch {
    persisted = false;
  }

  return { refs, source: "jit_backfill", persisted };
}

// ─── Resolver: hydrate refs with reference images / names ───────────────────
export async function resolveSceneAssets(
  refs: AssetRef[],
): Promise<ResolvedAsset[]> {
  if (!refs.length) return [];
  const sb = admin();
  const out: ResolvedAsset[] = [];

  const groupIds = (t: AssetType) => refs.filter((r) => r.type === t).map((r) => r.id);

  const charIds = groupIds("character");
  const locIds = groupIds("location");
  const bldIds = groupIds("building");
  const propIds = groupIds("prop");

  const [charRes, locRes, bldRes, propRes] = await Promise.all([
    charIds.length
      ? sb
          .from("brand_characters")
          .select("id, name, reference_image_url, voice_id")
          .in("id", charIds)
      : Promise.resolve({ data: [] as any[] }),
    locIds.length
      ? sb
          .from("brand_locations")
          .select("id, name, reference_image_url")
          .in("id", locIds)
      : Promise.resolve({ data: [] as any[] }),
    bldIds.length
      ? sb
          .from("brand_buildings")
          .select("id, name, reference_image_url")
          .in("id", bldIds)
      : Promise.resolve({ data: [] as any[] }),
    propIds.length
      ? sb
          .from("brand_props")
          .select("id, name, reference_image_url")
          .in("id", propIds)
      : Promise.resolve({ data: [] as any[] }),
  ]);

  const idx = new Map<string, any>();
  for (const row of (charRes as any).data ?? []) idx.set(`character::${row.id}`, row);
  for (const row of (locRes as any).data ?? []) idx.set(`location::${row.id}`, row);
  for (const row of (bldRes as any).data ?? []) idx.set(`building::${row.id}`, row);
  for (const row of (propRes as any).data ?? []) idx.set(`prop::${row.id}`, row);

  const table: Record<AssetType, string> = {
    character: "brand_characters",
    location: "brand_locations",
    building: "brand_buildings",
    prop: "brand_props",
    style: "composer_visual_styles",
  };

  for (const ref of refs) {
    const row = idx.get(`${ref.type}::${ref.id}`);
    out.push({
      ...ref,
      referenceImageUrl: row?.reference_image_url ?? null,
      canonicalName: row?.name ?? ref.displayName ?? null,
      voiceId: row?.voice_id ?? null,
      sourceTable: table[ref.type],
    });
  }
  return out;
}

// ─── Summary helper for logs / dispatch metadata ────────────────────────────
export function summarizeSceneAssets(refs: AssetRef[]) {
  const byType: Record<string, number> = {};
  for (const r of refs) byType[r.type] = (byType[r.type] ?? 0) + 1;
  return {
    total: refs.length,
    byType,
    characterIds: refs.filter((r) => r.type === "character").map((r) => r.id),
    locationIds: refs.filter((r) => r.type === "location").map((r) => r.id),
  };
}
