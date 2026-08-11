/**
 * Single model policy for the whole briefing-analysis pipeline.
 *
 * Before this file each briefing function shipped its own model chain
 * (storyboard ran a *preview* model in the main path, parse ran 2.5-flash,
 * deep-parse ran a third chain). One policy = one place to change, and the
 * same reliability characteristics for every entry point.
 */

export const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

/** Transient gateway statuses that are worth retrying. 429/402/4xx never are. */
export const TRANSIENT_STATUSES = new Set([500, 502, 503, 504]);

/**
 * Ordered attempt plan shared by every briefing call.
 * Stable models only — no `-preview` ids in a customer-facing main path.
 */
export const BRIEFING_MODEL_CHAIN = [
  "google/gemini-2.5-flash",
  "google/gemini-2.5-flash",
  "google/gemini-2.5-pro",
] as const;

/** Cheap, fast model used for the structured-output repair round. */
export const BRIEFING_REPAIR_MODEL = "google/gemini-2.5-flash";

export const BRIEFING_BACKOFF_MS = [0, 800, 1600];

export interface GatewayAttemptResult {
  response: Response;
  model: string;
  attempt: number;
}

export class GatewayError extends Error {
  status: number;
  body: string;
  constructor(status: number, message: string, body = "") {
    super(message);
    this.status = status;
    this.body = body;
  }
}

/**
 * Runs the shared model chain against the Lovable AI Gateway.
 *
 * No artificial timeout is applied — generation takes as long as it takes and
 * aborting only throws away work that is billed anyway.
 */
export async function callBriefingGateway(
  apiKey: string,
  buildBody: (model: string) => unknown,
  label = "briefing",
): Promise<GatewayAttemptResult> {
  let lastStatus = 0;
  let lastBody = "";

  for (let i = 0; i < BRIEFING_MODEL_CHAIN.length; i++) {
    const model = BRIEFING_MODEL_CHAIN[i];
    const backoff = BRIEFING_BACKOFF_MS[i] ?? 1600;
    if (backoff > 0) {
      await new Promise((r) => setTimeout(r, backoff + Math.floor(Math.random() * 200)));
    }
    console.log(`[${label}] gateway attempt ${i + 1} model=${model}`);

    let response: Response;
    try {
      response = await fetch(GATEWAY_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(buildBody(model)),
      });
    } catch (netErr) {
      lastStatus = 0;
      lastBody = (netErr as Error).message ?? "network error";
      console.warn(`[${label}] network error attempt ${i + 1}: ${lastBody}`);
      continue;
    }

    // Never retry these — retrying makes rate limits and billing worse.
    if (response.status === 429 || response.status === 402) {
      throw new GatewayError(response.status, `gateway ${response.status}`);
    }
    if (response.ok) return { response, model, attempt: i + 1 };

    lastStatus = response.status;
    lastBody = await response.text().catch(() => "");
    if (!TRANSIENT_STATUSES.has(response.status)) {
      throw new GatewayError(response.status, `gateway ${response.status}`, lastBody.slice(0, 400));
    }
    console.warn(`[${label}] transient gateway ${response.status} on attempt ${i + 1}`);
  }

  throw new GatewayError(lastStatus || 503, `gateway unavailable (${lastStatus})`, lastBody.slice(0, 400));
}

/** Extracts the first tool-call argument object from a chat-completions body. */
export function readToolCallArguments(json: unknown): Record<string, unknown> {
  const call = (json as any)?.choices?.[0]?.message?.tool_calls?.[0];
  const args = call?.function?.arguments;
  if (!args) throw new Error("no tool call returned");
  return JSON.parse(args);
}
