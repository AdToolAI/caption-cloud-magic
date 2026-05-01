// Shared HeyGen Bootstrap helper.
// Ensures we always have a valid, cached talking_photo_id in
// `system_config.qa.heygen_talking_photo_id` so the Live Sweep never trips
// HeyGen's per-account 3-photo limit (error 401028).
//
// Used by:
//   - qa-live-sweep-bootstrap (manual "Bootstrap Assets" button)
//   - qa-live-sweep (on-demand self-heal before Talking Head test)

const HEYGEN_API_KEY = Deno.env.get("HEYGEN_API_KEY");
const HEYGEN_UPLOAD_BASE = "https://upload.heygen.com/v1";
const HEYGEN_BASE_V1 = "https://api.heygen.com/v1";
const HEYGEN_BASE_V2 = "https://api.heygen.com/v2";

const CFG_KEY = "qa.heygen_talking_photo_id";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface HeyGenBootstrapResult {
  ok: boolean;
  talking_photo_id?: string;
  reused?: boolean;
  pruned?: number;
  error?: string;
}

async function readCachedId(admin: any): Promise<string | undefined> {
  const { data: cfgRow } = await admin
    .from("system_config")
    .select("value")
    .eq("key", CFG_KEY)
    .maybeSingle();
  if (!cfgRow?.value) return undefined;
  if (typeof cfgRow.value === "string") return cfgRow.value;
  if (typeof cfgRow.value === "object" && cfgRow.value && "id" in cfgRow.value) {
    return String((cfgRow.value as any).id);
  }
  return undefined;
}

async function listCustomPhotos(): Promise<{ id: string; isPreset: boolean }[]> {
  if (!HEYGEN_API_KEY) return [];
  const res = await fetch(`${HEYGEN_BASE_V1}/talking_photo.list`, {
    headers: { "X-Api-Key": HEYGEN_API_KEY, accept: "application/json" },
  });
  if (!res.ok) {
    console.warn(`[heygen-bootstrap] talking_photo.list -> ${res.status}`);
    return [];
  }
  const json = await res.json();
  const items: any[] = Array.isArray(json?.data) ? json.data : [];
  // Return ALL ids (we previously filtered !is_preset, but HeyGen sometimes
  // mislabels custom uploads as presets — leading to empty prune lists and
  // an immediate 401028 on the next upload). DELETE on a true preset just
  // returns 4xx, which we log and continue.
  return items
    .filter((x) => x?.id)
    .map((x) => ({ id: String(x.id), isPreset: Boolean(x?.is_preset) }));
}

async function pruneAllCustom(): Promise<number> {
  if (!HEYGEN_API_KEY) return 0;
  const items = await listCustomPhotos();
  let deleted = 0;
  for (const item of items) {
    // V2 first, fall back to V1 (some account tiers only accept V1 DELETE).
    let ok = false;
    for (const base of [HEYGEN_BASE_V2, HEYGEN_BASE_V1]) {
      try {
        const dr = await fetch(`${base}/talking_photo/${item.id}`, {
          method: "DELETE",
          headers: { "X-Api-Key": HEYGEN_API_KEY },
        });
        console.log(`[heygen-bootstrap] DELETE ${base}/talking_photo/${item.id} -> ${dr.status} (preset=${item.isPreset})`);
        if (dr.ok) { ok = true; break; }
      } catch (e) {
        console.warn(`[heygen-bootstrap] DELETE ${base} threw`, e);
      }
    }
    if (ok) deleted += 1;
    // HeyGen quota release is slow — give it 2 s per slot.
    await sleep(2000);
  }
  return deleted;
}

async function fetchPortrait(admin: any): Promise<{ buf: ArrayBuffer; contentType: string } | null> {
  // 1) Prefer the bootstrap-provisioned portrait in qa-test-assets.
  try {
    const { data: signed } = await admin.storage
      .from("qa-test-assets")
      .createSignedUrl("test-portrait.png", 600);
    if (signed?.signedUrl) {
      const r = await fetch(signed.signedUrl);
      if (r.ok) {
        const blob = await r.blob();
        const ct = (blob.type || "image/jpeg").toLowerCase();
        return {
          buf: await blob.arrayBuffer(),
          contentType: ct === "image/png" ? "image/png" : "image/jpeg",
        };
      }
    }
  } catch (e) {
    console.warn("[heygen-bootstrap] qa-test-assets portrait unavailable:", e);
  }
  // 2) Public fallback so Live-Sweep self-heal works even if bootstrap was never run.
  try {
    const r = await fetch(
      "https://storage.googleapis.com/lovable-public/qa-mock/sample-portrait.jpg",
    );
    if (r.ok) {
      const blob = await r.blob();
      return { buf: await blob.arrayBuffer(), contentType: "image/jpeg" };
    }
  } catch (e) {
    console.warn("[heygen-bootstrap] public portrait fallback failed:", e);
  }
  return null;
}

async function uploadOnce(buf: ArrayBuffer, contentType: string): Promise<{ id?: string; error?: string }> {
  if (!HEYGEN_API_KEY) return { error: "HEYGEN_API_KEY not configured" };
  const upRes = await fetch(`${HEYGEN_UPLOAD_BASE}/talking_photo`, {
    method: "POST",
    headers: {
      "X-Api-Key": HEYGEN_API_KEY,
      "Content-Type": contentType,
      accept: "application/json",
    },
    body: buf,
  });
  const respText = await upRes.text();
  if (!upRes.ok) {
    return { error: `HeyGen upload ${upRes.status}: ${respText.slice(0, 200)}` };
  }
  try {
    const json = JSON.parse(respText);
    const id = json?.data?.talking_photo_id;
    if (!id) return { error: `Upload missing talking_photo_id: ${respText.slice(0, 200)}` };
    return { id: String(id) };
  } catch {
    return { error: `Upload returned non-JSON: ${respText.slice(0, 200)}` };
  }
}

async function persistId(admin: any, id: string): Promise<void> {
  await admin.from("system_config").upsert(
    { key: CFG_KEY, value: id, updated_at: new Date().toISOString() },
    { onConflict: "key" },
  );
  // Sanity read-back: silent log so we know upsert really landed.
  const verified = await readCachedId(admin);
  if (verified !== id) {
    console.warn(
      `[heygen-bootstrap] persist verification mismatch: wrote=${id} read=${verified}`,
    );
  } else {
    console.log(`[heygen-bootstrap] persisted talking_photo_id=${id}`);
  }
}

/**
 * Ensure we have a usable HeyGen talking_photo_id cached.
 *
 * Flow:
 *  1. Read cached id from system_config.
 *  2. If present, validate against `talking_photo.list`. Reuse if still there.
 *  3. Otherwise, prune ALL custom photos (with 300 ms gaps), upload portrait.
 *  4. If first upload returns 401028, prune+wait+retry once.
 */
export async function ensureHeyGenTalkingPhoto(admin: any): Promise<HeyGenBootstrapResult> {
  if (!HEYGEN_API_KEY) {
    return { ok: false, error: "HEYGEN_API_KEY not configured" };
  }

  // 1 + 2: try reuse
  const cachedId = await readCachedId(admin);
  if (cachedId) {
    try {
      const items = await listCustomPhotos();
      if (items.some((x) => x.id === cachedId)) {
        console.log(`[heygen-bootstrap] reusing cached talking_photo_id=${cachedId}`);
        return { ok: true, talking_photo_id: cachedId, reused: true };
      }
      console.warn(`[heygen-bootstrap] cached id=${cachedId} no longer on HeyGen`);
    } catch (e) {
      console.warn(`[heygen-bootstrap] list call failed, will attempt fresh upload`, e);
    }
  }

  // 3: portrait
  const portrait = await fetchPortrait(admin);
  if (!portrait) {
    return { ok: false, error: "Could not fetch any bootstrap portrait" };
  }

  // 3b: aggressive prune
  const prunedFirst = await pruneAllCustom();

  // 3c: first upload attempt
  let up = await uploadOnce(portrait.buf, portrait.contentType);
  if (up.id) {
    await persistId(admin, up.id);
    return { ok: true, talking_photo_id: up.id, reused: false, pruned: prunedFirst };
  }

  // 4: 401028 fallback — prune again + wait + retry
  if (up.error && (/401028/.test(up.error) || /photo avatars/i.test(up.error))) {
    console.warn(`[heygen-bootstrap] 401028 on first upload, pruning + retry`);
    await sleep(1000);
    const prunedSecond = await pruneAllCustom();
    await sleep(1000);
    up = await uploadOnce(portrait.buf, portrait.contentType);
    if (up.id) {
      await persistId(admin, up.id);
      return {
        ok: true,
        talking_photo_id: up.id,
        reused: false,
        pruned: prunedFirst + prunedSecond,
      };
    }
  }

  return { ok: false, error: up.error || "Unknown HeyGen upload failure", pruned: prunedFirst };
}
