// Bond QA — Live Sweep Asset Bootstrap
// Idempotent: generates a reusable test image (FLUX Schnell via Lovable AI Gateway)
// and copies a small sample video + audio into qa-test-assets bucket.
// Run once before the first live sweep; subsequent calls are cheap no-ops.

import { createClient } from "npm:@supabase/supabase-js@2.95.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
const HEYGEN_API_KEY = Deno.env.get("HEYGEN_API_KEY");

const HEYGEN_UPLOAD_BASE = "https://upload.heygen.com/v1";
const HEYGEN_BASE_V1 = "https://api.heygen.com/v1";
const HEYGEN_BASE_V2 = "https://api.heygen.com/v2";

/**
 * Ensures we have a cached HeyGen talking_photo_id in `system_config`.
 * This is a permanent reusable photo so the Live Sweep never trips the
 * per-account 3-photo limit (error 401028). If a cached id exists and is
 * still valid on HeyGen, we keep it; otherwise we prune custom photos and
 * upload a fresh one from the bootstrap portrait.
 */
async function ensureHeyGenTalkingPhoto(
  admin: any,
): Promise<{ ok: boolean; talking_photo_id?: string; reused?: boolean; error?: string }> {
  if (!HEYGEN_API_KEY) {
    return { ok: false, error: "HEYGEN_API_KEY not configured" };
  }

  // 1. Try to read cached id from system_config
  const CFG_KEY = "qa.heygen_talking_photo_id";
  const { data: cfgRow } = await admin
    .from("system_config")
    .select("value")
    .eq("key", CFG_KEY)
    .maybeSingle();
  const cachedId: string | undefined =
    typeof cfgRow?.value === "string"
      ? cfgRow.value
      : (cfgRow?.value && typeof cfgRow.value === "object" && "id" in cfgRow.value
          ? String((cfgRow.value as any).id)
          : undefined);

  // 2. If cached, validate by listing — if HeyGen still has it, reuse.
  if (cachedId) {
    try {
      const listRes = await fetch(`${HEYGEN_BASE_V1}/talking_photo.list`, {
        headers: { "X-Api-Key": HEYGEN_API_KEY, accept: "application/json" },
      });
      if (listRes.ok) {
        const json = await listRes.json();
        const items: any[] = Array.isArray(json?.data) ? json.data : [];
        if (items.some((x) => x?.id === cachedId)) {
          console.log(`[bootstrap] reusing cached HeyGen talking_photo_id=${cachedId}`);
          return { ok: true, talking_photo_id: cachedId, reused: true };
        }
        console.warn(`[bootstrap] cached talking_photo_id=${cachedId} no longer on HeyGen, re-uploading`);
      }
    } catch (e) {
      console.warn(`[bootstrap] HeyGen list failed, attempting fresh upload:`, e);
    }
  }

  // 3. Aggressive prune: delete ALL custom talking photos so we have headroom.
  try {
    const listRes = await fetch(`${HEYGEN_BASE_V1}/talking_photo.list`, {
      headers: { "X-Api-Key": HEYGEN_API_KEY, accept: "application/json" },
    });
    if (listRes.ok) {
      const json = await listRes.json();
      const items: any[] = Array.isArray(json?.data) ? json.data : [];
      const custom = items.filter((x) => !x?.is_preset);
      console.log(`[bootstrap] pruning ${custom.length} custom HeyGen photos before fresh upload`);
      for (const item of custom) {
        if (!item?.id) continue;
        const dr = await fetch(`${HEYGEN_BASE_V2}/talking_photo/${item.id}`, {
          method: "DELETE",
          headers: { "X-Api-Key": HEYGEN_API_KEY },
        });
        console.log(`[bootstrap] HeyGen delete ${item.id} -> ${dr.status}`);
      }
    }
  } catch (e) {
    console.warn(`[bootstrap] HeyGen prune failed (non-fatal):`, e);
  }

  // 4. Fetch the bootstrap portrait we already provisioned.
  let portraitBlob: Blob;
  let contentType = "image/jpeg";
  try {
    const { data: signed } = await admin.storage
      .from("qa-test-assets")
      .createSignedUrl("test-portrait.png", 600);
    if (!signed?.signedUrl) throw new Error("no signed url for test-portrait.png");
    const r = await fetch(signed.signedUrl);
    if (!r.ok) throw new Error(`portrait fetch ${r.status}`);
    portraitBlob = await r.blob();
    const ct = (portraitBlob.type || "image/jpeg").toLowerCase();
    contentType = ct === "image/png" ? "image/png" : "image/jpeg";
  } catch (e: any) {
    return { ok: false, error: `Failed to fetch bootstrap portrait: ${e?.message || e}` };
  }

  // 5. Upload to HeyGen.
  try {
    const buf = await portraitBlob.arrayBuffer();
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
      return { ok: false, error: `HeyGen upload ${upRes.status}: ${respText.slice(0, 200)}` };
    }
    const json = JSON.parse(respText);
    const newId = json?.data?.talking_photo_id;
    if (!newId) {
      return { ok: false, error: `HeyGen upload missing talking_photo_id: ${respText.slice(0, 200)}` };
    }

    // 6. Persist in system_config (upsert).
    await admin.from("system_config").upsert(
      { key: CFG_KEY, value: newId, updated_at: new Date().toISOString() },
      { onConflict: "key" },
    );
    console.log(`[bootstrap] cached new HeyGen talking_photo_id=${newId}`);
    return { ok: true, talking_photo_id: newId, reused: false };
  } catch (e: any) {
    return { ok: false, error: `HeyGen upload exception: ${e?.message || e}` };
  }
}

// Reliable public MP4/MP3 samples — Big Buck Bunny H.264/AAC is the de-facto
// industry test sample and plays cleanly in Chromium on Lambda. The previous
// Google GTV "ForBiggerBlazes" URL triggered MEDIA_ELEMENT_ERROR Code 4 in
// Remotion Lambda Chromium (likely Range/CORS handling on storage.googleapis.com).
const SAMPLE_VIDEO_URL =
  "https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/360/Big_Buck_Bunny_360_10s_1MB.mp4";
const SAMPLE_AUDIO_URL =
  "https://download.samplelib.com/mp3/sample-3s.mp3";

async function uploadIfMissing(
  supabase: any,
  path: string,
  fetchBody: () => Promise<{ blob: Blob; contentType: string }>,
  opts: { minBytes?: number; expectedMimePrefix?: string; force?: boolean } = {},
): Promise<{ uploaded: boolean; repaired?: boolean; path: string; error?: string; reason?: string }> {
  // Check existing object — if it's clearly corrupt (too small, wrong mime,
  // looks like an XML S3 error response), overwrite it.
  let needsUpload = true;
  let repairing = false;
  if (opts.force) {
    repairing = true;
    console.log(`[bootstrap] force-replacing ${path}`);
  } else {
    try {
      const probe = await supabase.storage.from("qa-test-assets").createSignedUrl(path, 60);
      if (probe.data?.signedUrl) {
        const head = await fetch(probe.data.signedUrl, { method: "HEAD" });
        const len = Number(head.headers.get("content-length") || 0);
        const ct = head.headers.get("content-type") || "";
        const minBytes = opts.minBytes ?? 1024;
        const expectedMime = opts.expectedMimePrefix;
        const corrupt =
          len < minBytes ||
          ct.includes("xml") ||
          (expectedMime && !ct.startsWith(expectedMime));
        if (!corrupt) {
          needsUpload = false;
        } else {
          repairing = true;
          console.warn(`[bootstrap] repairing ${path} (size=${len}, ct=${ct})`);
        }
      }
    } catch {
      // Assume missing
    }
  }
  if (!needsUpload) return { uploaded: false, path };

  try {
    const { blob, contentType } = await fetchBody();
    const { error } = await supabase.storage
      .from("qa-test-assets")
      .upload(path, blob, { contentType, upsert: true });
    if (error) return { uploaded: false, repaired: repairing, path, error: error.message };
    return { uploaded: true, repaired: repairing, path };
  } catch (e: any) {
    return { uploaded: false, repaired: repairing, path, error: e?.message || String(e) };
  }
}

// ---- PNG builder for FLUX Fill mask ---------------------------------------
// Builds a deterministic 8-bit grayscale PNG of `size` x `size` with a
// centered white square (`whiteSize` x `whiteSize`) on a black background.
// Uses uncompressed DEFLATE blocks → no deps, valid CRC32 + adler32.
function buildMaskPng(size: number, whiteSize: number): Uint8Array {
  const offset = Math.floor((size - whiteSize) / 2);
  const rowLen = size + 1;
  const raw = new Uint8Array(rowLen * size);
  for (let y = 0; y < size; y++) {
    const rowStart = y * rowLen;
    raw[rowStart] = 0;
    if (y >= offset && y < offset + whiteSize) {
      for (let x = offset; x < offset + whiteSize; x++) raw[rowStart + 1 + x] = 0xff;
    }
  }
  const idat = zlibStore(raw);
  const sig = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, size);
  dv.setUint32(4, size);
  ihdr[8] = 8; ihdr[9] = 0; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const chunks = [sig, pngChunk("IHDR", ihdr), pngChunk("IDAT", idat), pngChunk("IEND", new Uint8Array(0))];
  let total = 0; for (const c of chunks) total += c.length;
  const out = new Uint8Array(total);
  let pos = 0; for (const c of chunks) { out.set(c, pos); pos += c.length; }
  return out;
}
function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = new TextEncoder().encode(type);
  const buf = new Uint8Array(8 + data.length + 4);
  const dv = new DataView(buf.buffer);
  dv.setUint32(0, data.length);
  buf.set(typeBytes, 4);
  buf.set(data, 8);
  const crcInput = new Uint8Array(typeBytes.length + data.length);
  crcInput.set(typeBytes, 0);
  crcInput.set(data, typeBytes.length);
  dv.setUint32(8 + data.length, crc32(crcInput));
  return buf;
}
function zlibStore(data: Uint8Array): Uint8Array {
  const MAX = 65535;
  const blockCount = Math.max(1, Math.ceil(data.length / MAX));
  const out = new Uint8Array(2 + data.length + blockCount * 5 + 4);
  out[0] = 0x78; out[1] = 0x01;
  let pos = 2;
  for (let i = 0; i < data.length; i += MAX) {
    const len = Math.min(MAX, data.length - i);
    const last = (i + len >= data.length) ? 1 : 0;
    out[pos++] = last;
    out[pos++] = len & 0xff; out[pos++] = (len >> 8) & 0xff;
    const nlen = (~len) & 0xffff;
    out[pos++] = nlen & 0xff; out[pos++] = (nlen >> 8) & 0xff;
    out.set(data.subarray(i, i + len), pos);
    pos += len;
  }
  const dv = new DataView(out.buffer);
  dv.setUint32(pos, adler32(data));
  return out.subarray(0, pos + 4);
}
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function adler32(buf: Uint8Array): number {
  let a = 1, b = 0;
  for (let i = 0; i < buf.length; i++) { a = (a + buf[i]) % 65521; b = (b + a) % 65521; }
  return ((b << 16) | a) >>> 0;
}

// Force-replaces test-portrait.png with a fresh face image. Tries multiple
// sources because HeyGen's face detector occasionally rejects synthetic faces.
async function provisionPortrait(
  admin: any,
): Promise<{ uploaded: boolean; replaced: boolean; path: string; source?: string; size?: number; error?: string }> {
  const path = "test-portrait.png";
  const sources: Array<() => Promise<{ blob: Blob; contentType: string; source: string } | null>> = [
    // Primary: thispersondoesnotexist.com — synthetic but reliably a single, frontal, large face.
    async () => {
      try {
        const r = await fetch("https://thispersondoesnotexist.com/", {
          headers: { "User-Agent": "Mozilla/5.0 (compatible; LovableBootstrap/1.0)" },
        });
        if (!r.ok) return null;
        const blob = await r.blob();
        if (blob.size < 20_000) return null;
        return { blob, contentType: r.headers.get("content-type") || "image/jpeg", source: "thispersondoesnotexist" };
      } catch (e) {
        console.warn("[bootstrap] thispersondoesnotexist failed:", e);
        return null;
      }
    },
    // Secondary: AI Gateway portrait generation.
    async () => {
      if (!LOVABLE_API_KEY) return null;
      try {
        const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash-image",
            messages: [{
              role: "user",
              content:
                "Photorealistic studio headshot of one adult person centered in frame, looking directly into camera, neutral relaxed expression, mouth closed, eyes open, full face visible, no glasses, no hat, plain light gray background, soft front lighting, shoulders visible, square 1:1 framing, sharp focus on face.",
            }],
            modalities: ["image", "text"],
          }),
        });
        if (!aiRes.ok) return null;
        const json = await aiRes.json();
        const dataUrl: string | undefined = json?.choices?.[0]?.message?.images?.[0]?.image_url?.url;
        if (!dataUrl?.startsWith("data:image/")) return null;
        const [, base64] = dataUrl.split(",");
        const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
        if (bytes.byteLength < 20_000) return null;
        return { blob: new Blob([bytes], { type: "image/png" }), contentType: "image/png", source: "lovable-ai-gateway" };
      } catch (e) {
        console.warn("[bootstrap] AI Gateway portrait failed:", e);
        return null;
      }
    },
    // Tertiary: another fresh attempt at thispersondoesnotexist (different seed each call).
    async () => {
      try {
        const r = await fetch("https://thispersondoesnotexist.com/?retry=" + Date.now(), {
          headers: { "User-Agent": "Mozilla/5.0 (compatible; LovableBootstrap/1.0)" },
        });
        if (!r.ok) return null;
        const blob = await r.blob();
        if (blob.size < 20_000) return null;
        return { blob, contentType: r.headers.get("content-type") || "image/jpeg", source: "thispersondoesnotexist-retry" };
      } catch {
        return null;
      }
    },
  ];

  let chosen: { blob: Blob; contentType: string; source: string } | null = null;
  for (const src of sources) {
    chosen = await src();
    if (chosen) break;
  }
  if (!chosen) {
    return { uploaded: false, replaced: false, path, error: "All portrait sources failed" };
  }

  // Always overwrite — bootstrap call is the user's signal "give me a fresh portrait".
  const { error } = await admin.storage
    .from("qa-test-assets")
    .upload(path, chosen.blob, { contentType: chosen.contentType, upsert: true });
  if (error) {
    return { uploaded: false, replaced: false, path, source: chosen.source, error: error.message };
  }
  console.log(`[bootstrap] portrait replaced via ${chosen.source}, size=${chosen.blob.size}`);
  return { uploaded: true, replaced: true, path, source: chosen.source, size: chosen.blob.size };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Admin guard
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Missing Authorization" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) {
    return new Response(JSON.stringify({ error: "Invalid token" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data: roleData } = await adminClient
    .from("user_roles")
    .select("role")
    .eq("user_id", userData.user.id)
    .eq("role", "admin")
    .maybeSingle();
  if (!roleData) {
    return new Response(JSON.stringify({ error: "Admin only" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const results: any[] = [];

  // 1. Test image — try Lovable AI Gateway (Nano Banana Flash) first, fallback to public sample
  results.push(
    await uploadIfMissing(adminClient, "test-image.png", async () => {
      if (LOVABLE_API_KEY) {
        try {
          const aiRes = await fetch(
            "https://ai.gateway.lovable.dev/v1/chat/completions",
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${LOVABLE_API_KEY}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                model: "google/gemini-2.5-flash-image",
                messages: [
                  {
                    role: "user",
                    content:
                      "A simple neutral product on a clean white studio background, soft even lighting, photo-realistic, 1024x1024",
                  },
                ],
                modalities: ["image", "text"],
              }),
            },
          );
          if (aiRes.ok) {
            const json = await aiRes.json();
            const dataUrl: string | undefined =
              json?.choices?.[0]?.message?.images?.[0]?.image_url?.url;
            if (dataUrl?.startsWith("data:image/")) {
              const [, base64] = dataUrl.split(",");
              const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
              return { blob: new Blob([bytes], { type: "image/png" }), contentType: "image/png" };
            }
          }
        } catch (e) {
          console.warn("[bootstrap] AI Gateway image gen failed, using fallback:", e);
        }
      }
      // Fallback: download public sample
      const r = await fetch(
        "https://storage.googleapis.com/lovable-public/qa-mock/sample-1024.jpg",
      );
      return { blob: await r.blob(), contentType: r.headers.get("content-type") || "image/jpeg" };
    }),
  );

  // 2. Test video — copy a real, decodable MP4 (validates: size + mime)
  results.push(
    await uploadIfMissing(adminClient, "test-video-2s.mp4", async () => {
      const r = await fetch(SAMPLE_VIDEO_URL);
      if (!r.ok) throw new Error(`Sample video fetch failed: ${r.status}`);
      return { blob: await r.blob(), contentType: r.headers.get("content-type") || "video/mp4" };
    }, { minBytes: 50_000, expectedMimePrefix: "video/", force: true }),
  );

  // 3. Test audio — copy public sample (validates: size + mime)
  results.push(
    await uploadIfMissing(adminClient, "test-audio.mp3", async () => {
      const r = await fetch(SAMPLE_AUDIO_URL);
      if (!r.ok) throw new Error(`Sample audio fetch failed: ${r.status}`);
      return { blob: await r.blob(), contentType: r.headers.get("content-type") || "audio/mpeg" };
    }, { minBytes: 5_000, expectedMimePrefix: "audio/" }),
  );

  // 4. Test portrait — REQUIRED by HeyGen Photo-Avatar (face detection enforced).
  // ALWAYS replace on bootstrap call: a previously generated portrait may be
  // technically valid (size + mime) but rejected by HeyGen's face detector
  // (error 400127). Re-running bootstrap should give the user a fresh attempt.
  // Strategy: thispersondoesnotexist.com first (highest face-detection rate),
  // AI Gateway as secondary. We try multiple fetches and only upload if we
  // successfully get a real-looking face image.
  const portraitResult = await provisionPortrait(adminClient);
  results.push(portraitResult);

  // 5. FLUX Fill mask — programmatically built 512x512 PNG (black bg, white centered 256x256 square).
  // Used by the deep-sweep Magic Edit flow. Idempotent + no external fetch.
  // Built from raw bytes with valid CRC32 chunks (avoids base64-decode fragility that caused 400 errors).
  results.push(
    await uploadIfMissing(adminClient, "sample-mask-512.png", async () => {
      const png = buildMaskPng(512, 256);
      return { blob: new Blob([png], { type: "image/png" }), contentType: "image/png" };
    }, { minBytes: 200, expectedMimePrefix: "image/" }),
  );

  // 6. HeyGen cached talking_photo_id — uploaded once, reused by every sweep.
  // Avoids HeyGen's per-account 3-photo limit (error 401028) on every run.
  const heygenResult = await ensureHeyGenTalkingPhoto(adminClient);
  results.push({
    uploaded: heygenResult.ok && !heygenResult.reused,
    repaired: heygenResult.ok && !heygenResult.reused,
    path: "system_config:qa.heygen_talking_photo_id",
    reason: heygenResult.reused ? "reused-cached" : (heygenResult.ok ? "uploaded-fresh" : undefined),
    error: heygenResult.error,
    talking_photo_id: heygenResult.talking_photo_id,
  });

  return new Response(
    JSON.stringify({
      success: true,
      bucket: "qa-test-assets",
      assets: results,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
