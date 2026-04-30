// Bond QA Agent — Mock Response Helper
//
// When a request comes in with header `x-qa-mock: true`, edge functions that
// would normally hit an expensive external provider (Replicate, Runway,
// Hedra, ElevenLabs music, etc.) short-circuit and return a deterministic
// mock response. This keeps the Bond QA Agent's interactive smoke missions
// safe to run on every cron tick without burning real credits.
//
// Usage at the top of an edge function (right after CORS preflight):
//
//   import { isQaMockRequest, qaMockResponse } from "../_shared/qaMock.ts";
//   if (isQaMockRequest(req)) {
//     return qaMockResponse({ corsHeaders, kind: "video" });
//   }

const SAMPLE_VIDEO_URL =
  "https://storage.googleapis.com/lovable-public/qa-mock/sample-5s.mp4";
const SAMPLE_IMAGE_URL =
  "https://storage.googleapis.com/lovable-public/qa-mock/sample-1024.jpg";
const SAMPLE_AUDIO_URL =
  "https://storage.googleapis.com/lovable-public/qa-mock/sample-5s.mp3";

export function isQaMockRequest(req: Request): boolean {
  const h = req.headers.get("x-qa-mock");
  return h === "true" || h === "1";
}

type MockKind = "video" | "image" | "audio" | "music" | "talking-head";

interface MockOpts {
  corsHeaders: Record<string, string>;
  kind: MockKind;
  /** Optional extra fields to merge into the mock body. */
  extra?: Record<string, unknown>;
}

export function qaMockResponse({ corsHeaders, kind, extra }: MockOpts): Response {
  const id = `qa-mock-${kind}-${crypto.randomUUID()}`;
  let body: Record<string, unknown>;

  switch (kind) {
    case "image":
      body = {
        success: true,
        mock: true,
        url: SAMPLE_IMAGE_URL,
        imageUrl: SAMPLE_IMAGE_URL,
        output: SAMPLE_IMAGE_URL,
        predictionId: id,
        status: "succeeded",
      };
      break;
    case "audio":
    case "music":
      body = {
        success: true,
        mock: true,
        url: SAMPLE_AUDIO_URL,
        audioUrl: SAMPLE_AUDIO_URL,
        output: SAMPLE_AUDIO_URL,
        predictionId: id,
        status: "succeeded",
        duration: 5,
      };
      break;
    case "talking-head":
      body = {
        success: true,
        mock: true,
        videoUrl: SAMPLE_VIDEO_URL,
        audioUrl: SAMPLE_AUDIO_URL,
        predictionId: id,
        status: "succeeded",
      };
      break;
    case "video":
    default:
      body = {
        success: true,
        mock: true,
        videoUrl: SAMPLE_VIDEO_URL,
        url: SAMPLE_VIDEO_URL,
        output: SAMPLE_VIDEO_URL,
        predictionId: id,
        status: "succeeded",
        duration: 5,
      };
      break;
  }

  if (extra) Object.assign(body, extra);

  console.log(`[qaMock] short-circuit (${kind}) → ${id}`);

  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
