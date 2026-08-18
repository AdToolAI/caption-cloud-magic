/**
 * FA-4 v404 — Server Motion Calibration / Performance Harness (TEST-ONLY).
 *
 * Measures the frozen mouth-band motion metric on the six S11 provider
 * input/output pairs using the production-identical Remotion Lambda
 * `type:"still"` path. Read-only: no DB writes, no Sync.so dispatch,
 * no production code imports.
 *
 * Run:
 *   deno run -A scripts/calibration/fa4-v404-motion-calibration.ts sweep
 *   deno run -A scripts/calibration/fa4-v404-motion-calibration.ts perf <N> <conc> <pairs>
 */

import { AwsClient } from "npm:aws4fetch@1.0.18";
import jpeg from "npm:jpeg-js@0.4.4";

const AWS_REGION = "eu-central-1";
const REMOTION_VERSION = "4.0.462";
const STILL_COMPOSITION = "DialogStitchVideo";
const FPS = 30;

// Frozen SOURCE-space ROI (v404 contract).
const ROI = { cx: 0.5, cy: 0.6, w: 0.28, h: 0.12 };

const CACHE_DIR = "/tmp/cal/stills";
await Deno.mkdir(CACHE_DIR, { recursive: true });

const accessKeyId = Deno.env.get("AWS_ACCESS_KEY_ID")!;
const secretAccessKey = Deno.env.get("AWS_SECRET_ACCESS_KEY")!;
const serveUrl = Deno.env.get("REMOTION_SERVE_URL")!;
const arn = Deno.env.get("REMOTION_LAMBDA_FUNCTION_ARN") || "";
const fnName = arn.includes(":function:") ? arn.split(":function:")[1] : arn;
const aws = new AwsClient({ accessKeyId, secretAccessKey, region: AWS_REGION });
const lambdaUrl =
  `https://lambda.${AWS_REGION}.amazonaws.com/2015-03-31/functions/${fnName}/invocations`;

export interface Asset {
  pass_idx: number;
  speaker: string;
  label: "motion" | "noop";
  turn: string;
  pre: string;
  out: string;
  width: number;
  height: number;
  duration: number;
  fps: number;
}

const artifactMap: Record<string, Asset> = JSON.parse(
  await Deno.readTextFile(new URL("./s11-artifact-map.json", import.meta.url)),
);

async function sha(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export interface StillResult {
  bytes: Uint8Array;
  latencyMs: number | null; // null when served from harness cache
}

/** Production-identical still invoke. */
async function renderStill(
  videoUrl: string,
  totalSec: number,
  frame: number,
  useCache: boolean,
): Promise<StillResult> {
  const key = await sha(`${videoUrl}|${frame}|${STILL_COMPOSITION}|jpeg85|scale1|1280x720`);
  const cachePath = `${CACHE_DIR}/${key}.jpg`;
  if (useCache) {
    try {
      const bytes = await Deno.readFile(cachePath);
      return { bytes, latencyMs: null };
    } catch { /* miss */ }
  }

  const payload = {
    type: "still",
    serveUrl,
    composition: STILL_COMPOSITION,
    inputProps: {
      type: "payload",
      payload: JSON.stringify({
        masterVideoUrl: videoUrl,
        masterAudioUrl: "",
        totalSec,
        shots: [],
      }),
    },
    version: REMOTION_VERSION,
    imageFormat: "jpeg",
    jpegQuality: 85,
    frame,
    privacy: "public",
    attempt: 1,
    logLevel: "warn",
    outName: `fa4cal-${key}-${Date.now()}.jpeg`,
    timeoutInMilliseconds: 120000,
    chromiumOptions: {},
    scale: 1,
    downloadBehavior: { type: "play-in-browser", fileName: null },
    forceHeight: null,
    forceWidth: null,
    bucketName: null,
    offthreadVideoCacheSizeInBytes: null,
    deleteAfter: null,
    envVariables: {},
    forcePathStyle: false,
  };

  const t0 = performance.now();
  const res = await aws.fetch(lambdaUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`lambda_http_${res.status}:${(await res.text()).slice(0, 200)}`);
  const parsed = JSON.parse(await res.text());
  const output: string | undefined = parsed?.output ?? parsed?.url;
  if (!output) throw new Error(`lambda_no_output:${JSON.stringify(parsed).slice(0, 300)}`);
  const dl = await fetch(output);
  if (!dl.ok) throw new Error(`still_download_${dl.status}`);
  const bytes = new Uint8Array(await dl.arrayBuffer());
  const latencyMs = performance.now() - t0;
  await Deno.writeFile(cachePath, bytes);
  return { bytes, latencyMs };
}

/** Per-asset Source→Still transform onto the 1280×720 still canvas. */
export function stillRoi(sw: number, sh: number, stillW: number, stillH: number) {
  const s = Math.max(stillW / sw, stillH / sh);
  const dx = (stillW - sw * s) / 2;
  const dy = (stillH - sh * s) / 2;
  const cxStill = (ROI.cx * sw * s + dx) / stillW;
  const cyStill = (ROI.cy * sh * s + dy) / stillH;
  const wStill = (ROI.w * sw * s) / stillW;
  const hStill = (ROI.h * sh * s) / stillH;
  const bw = Math.max(8, Math.round(stillW * wStill));
  const bh = Math.max(8, Math.round(stillH * hStill));
  const bx = Math.min(Math.max(Math.round(cxStill * stillW - bw / 2), 0), stillW - bw);
  const by = Math.min(Math.max(Math.round(cyStill * stillH - bh / 2), 0), stillH - bh);
  return { s, dx, dy, cxStill, cyStill, bx, by, bw, bh };
}

export interface MotionMetric {
  mean: number;
  peak: number;
  frames: number;
  roi: { bx: number; by: number; bw: number; bh: number };
  stillW: number;
  stillH: number;
  latencies: number[];
}

function timestamps(duration: number, n: number): number[] {
  const start = 0.05 * duration;
  const end = 0.95 * duration;
  const step = n > 1 ? (end - start) / (n - 1) : 0;
  return Array.from({ length: n }, (_, i) => start + step * i);
}

async function pool<T>(items: (() => Promise<T>)[], conc: number): Promise<T[]> {
  const results: T[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(conc, items.length) }, async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await items[i]();
    }
  });
  await Promise.all(workers);
  return results;
}

export async function measureVideo(
  videoUrl: string,
  sw: number,
  sh: number,
  duration: number,
  n: number,
  conc: number,
  useCache: boolean,
): Promise<MotionMetric> {
  const ts = timestamps(duration, n);
  const frames = ts.map((t) => Math.round(t * FPS));
  const stills = await pool(
    frames.map((f) => () => renderStill(videoUrl, duration, f, useCache)),
    conc,
  );
  const decoded = stills.map((s) => jpeg.decode(s.bytes, { useTArray: true }));
  const stillW = decoded[0].width;
  const stillH = decoded[0].height;
  const roi = stillRoi(sw, sh, stillW, stillH);
  const { bx, by, bw, bh } = roi;
  const px = bw * bh;

  const lum: Float64Array[] = decoded.map((img) => {
    const arr = new Float64Array(px);
    let k = 0;
    for (let y = by; y < by + bh; y++) {
      for (let x = bx; x < bx + bw; x++) {
        const off = (y * img.width + x) * 4;
        arr[k++] = 0.299 * img.data[off] + 0.587 * img.data[off + 1] + 0.114 * img.data[off + 2];
      }
    }
    return arr;
  });

  const meanY = new Float64Array(px);
  for (const f of lum) for (let p = 0; p < px; p++) meanY[p] += f[p];
  for (let p = 0; p < px; p++) meanY[p] /= lum.length;

  let sum = 0;
  let peak = 0;
  for (const f of lum) {
    for (let p = 0; p < px; p++) {
      const d = f[p] - meanY[p];
      const d2 = d * d;
      sum += d2;
      if (d2 > peak) peak = d2;
    }
  }
  return {
    mean: sum / (lum.length * px),
    peak,
    frames: lum.length,
    roi: { bx, by, bw, bh },
    stillW,
    stillH,
    latencies: stills.map((s) => s.latencyMs).filter((v): v is number => v !== null),
  };
}

function pct(sorted: number[], q: number): number {
  if (sorted.length === 0) return NaN;
  const idx = Math.min(sorted.length - 1, Math.ceil(q * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}

async function sweep() {
  const report: Record<string, unknown> = { generated_at: new Date().toISOString(), sweep: [] };
  const allLat: number[] = [];
  for (const n of [6, 8, 10, 12]) {
    const rows: Record<string, unknown>[] = [];
    for (const key of Object.keys(artifactMap)) {
      const a = artifactMap[key];
      const pre = await measureVideo(a.pre, a.width, a.height, a.duration, n, 4, true);
      const out = await measureVideo(a.out, a.width, a.height, a.duration, n, 4, true);
      allLat.push(...pre.latencies, ...out.latencies);
      rows.push({
        N: n,
        pass: a.pass_idx,
        turn: a.turn,
        speaker: a.speaker,
        label: a.label,
        roi_pre: pre.roi,
        roi_out: out.roi,
        still: `${pre.stillW}x${pre.stillH}`,
        preMean: pre.mean,
        prePeak: pre.peak,
        providerMean: out.mean,
        providerPeak: out.peak,
        deltaMean: out.mean - pre.mean,
        deltaPeak: out.peak - pre.peak,
      });
      console.log(
        `N=${n} p${a.pass_idx} ${a.turn} ${a.label} dMean=${(out.mean - pre.mean).toFixed(4)} dPeak=${
          (out.peak - pre.peak).toFixed(4)
        }`,
      );
    }
    const motion = rows.filter((r) => r.label === "motion").map((r) => r.deltaPeak as number);
    const noop = rows.filter((r) => r.label === "noop").map((r) => r.deltaPeak as number);
    const minMotion = Math.min(...motion);
    const maxNoop = Math.max(...noop);
    (report.sweep as unknown[]).push({
      N: n,
      rows,
      minMotion,
      maxNoop,
      gap: minMotion - maxNoop,
      pass: minMotion - maxNoop > 0,
    });
    console.log(`N=${n} minMotion=${minMotion} maxNoop=${maxNoop} gap=${minMotion - maxNoop}`);
  }
  const sortedLat = [...allLat].sort((a, b) => a - b);
  report.still_latency = {
    n: sortedLat.length,
    min: sortedLat[0],
    p50: pct(sortedLat, 0.5),
    p95: pct(sortedLat, 0.95),
    max: sortedLat[sortedLat.length - 1],
  };
  await Deno.writeTextFile(
    new URL("./fa4-v404-sweep-report.json", import.meta.url),
    JSON.stringify(report, null, 2),
  );
  console.log("wrote fa4-v404-sweep-report.json");
}

async function perf(n: number, conc: number, pairsWanted: number) {
  const keys = Object.keys(artifactMap);
  const pairTimes: { pass: number; ms: number }[] = [];
  const stillLat: number[] = [];
  let failures = 0;
  for (let i = 0; i < pairsWanted; i++) {
    const a = artifactMap[keys[i % keys.length]];
    const t0 = performance.now();
    try {
      const [pre, out] = await Promise.all([
        measureVideo(a.pre, a.width, a.height, a.duration, n, conc, false),
        measureVideo(a.out, a.width, a.height, a.duration, n, conc, false),
      ]);
      const ms = performance.now() - t0;
      pairTimes.push({ pass: a.pass_idx, ms });
      stillLat.push(...pre.latencies, ...out.latencies);
      console.log(`pair#${i} p${a.pass_idx} conc=${conc} ${ms.toFixed(0)}ms`);
    } catch (e) {
      failures++;
      console.log(`pair#${i} p${a.pass_idx} FAILED ${(e as Error).message}`);
    }
  }
  const pt = pairTimes.map((p) => p.ms).sort((x, y) => x - y);
  const sl = [...stillLat].sort((x, y) => x - y);
  const out = {
    N: n,
    concurrency: conc,
    failures,
    pair: { n: pt.length, p50: pct(pt, 0.5), p95: pct(pt, 0.95), max: pt[pt.length - 1] },
    still: { n: sl.length, min: sl[0], p50: pct(sl, 0.5), p95: pct(sl, 0.95), max: sl[sl.length - 1] },
    samples: pairTimes,
  };
  console.log(JSON.stringify(out.pair), JSON.stringify(out.still), "failures", failures);
  const file = new URL(`./fa4-v404-perf-N${n}-c${conc}.json`, import.meta.url);
  await Deno.writeTextFile(file, JSON.stringify(out, null, 2));
}

if (import.meta.main) {
  const [cmd, ...rest] = Deno.args;
  if (cmd === "sweep") await sweep();
  else if (cmd === "perf") {
    await perf(Number(rest[0] ?? 8), Number(rest[1] ?? 4), Number(rest[2] ?? 20));
  } else console.log("usage: sweep | perf <N> <conc> <pairs>");
}
