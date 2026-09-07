// TEMPORARY diagnostic function: exercises the real chunked transfer path with
// a large file. Deleted again after the large-file verification run.
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  CHUNK_SIZE,
  createUploadSession,
  headProviderOutput,
  sessionOffset,
  transferChunks,
} from "../_shared/video-enhance-transfer.ts";

const BUCKET = "background-projects";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok");
  const secret = Deno.env.get("CRON_SECRET");
  if (secret && req.headers.get("x-cron-secret") !== secret) {
    return new Response("forbidden", { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  if (body.cleanup) {
    const admin0 = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const del = await admin0.storage.from(BUCKET).remove(body.cleanup as string[]);
    return Response.json({ ok: !del.error, removed: del.data?.length ?? 0, error: del.error?.message });
  }
  const srcKey: string = body.srcKey;
  const dstKey: string = body.dstKey;
  const budgetMs: number = Number(body.budgetMs ?? 60_000);
  let uploadUrl: string | undefined = body.uploadUrl;
  let offset: number = Number(body.offset ?? 0);

  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(url, key);

  const signed = await admin.storage.from(BUCKET).createSignedUrl(srcKey, 3600);
  if (!signed.data?.signedUrl) {
    return Response.json({ ok: false, error: signed.error?.message ?? "no signed url" });
  }
  const src = signed.data.signedUrl;
  const head = await headProviderOutput(src);
  if (!head.ok || !head.contentLength) {
    return Response.json({ ok: false, phase: "head", head });
  }

  if (!uploadUrl) {
    const created = await createUploadSession({
      supabaseUrl: url,
      serviceKey: key,
      bucket: BUCKET,
      objectKey: dstKey,
      contentType: "video/mp4",
      size: head.contentLength,
    });
    if (!created.ok) return Response.json({ ok: false, phase: "create", error: created.error });
    uploadUrl = created.uploadUrl!;
  } else {
    const remote = await sessionOffset(uploadUrl, key);
    if (remote !== null) offset = remote;
  }

  const t0 = Date.now();
  let chunks = 0;
  const result = await transferChunks({
    admin,
    runId: "probe",
    providerUrl: src,
    uploadUrl: uploadUrl!,
    serviceKey: key,
    size: head.contentLength,
    startOffset: offset,
    budgetMs,
    onProgress: async () => {
      chunks += 1;
    },
  });
  const elapsedMs = Date.now() - t0;
  const moved = result.offset - offset;

  return Response.json({
    ok: !result.error,
    size: head.contentLength,
    acceptsRanges: head.acceptsRanges,
    chunkSize: CHUNK_SIZE,
    chunks,
    movedBytes: moved,
    elapsedMs,
    mbPerSec: +(moved / 1024 / 1024 / (elapsedMs / 1000)).toFixed(2),
    done: result.done,
    offset: result.offset,
    uploadUrl,
    error: result.error,
    rss: (Deno as unknown as { memoryUsage?: () => { rss: number } }).memoryUsage?.().rss ?? null,
  });
});
