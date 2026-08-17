/**
 * FA-4/P1-B — AWS region sanity (R1–R6).
 *
 * Proves that the restored `AWS_REGION_PATTERN` constant only reinstates the
 * region validation/fallback that existed before, and nothing else:
 *   - valid regions are accepted unchanged,
 *   - the production-observed invalid value "Global" falls back to eu-central-1,
 *   - REKOGNITION_REGION keeps priority over AWS_REGION,
 *   - importing the module raises no ReferenceError.
 *
 * The region is a module-level const, so each case imports a fresh module
 * instance (cache-busting query) and observes the Rekognition endpoint host
 * that the signer actually builds.
 */

import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";

// 1x1 PNG (valid header so probeImageDims works).
const PNG_1X1 = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
  0x89,
]);

let caseCounter = 0;

function setEnv(env: Record<string, string | undefined>) {
  for (const key of ["AWS_REGION", "REKOGNITION_REGION", "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY"]) {
    const v = env[key];
    if (v === undefined) Deno.env.delete(key);
    else Deno.env.set(key, v);
  }
}

/** Loads a fresh module instance under the given env and returns the Rekognition host it calls. */
async function resolveEndpointHost(env: Record<string, string | undefined>): Promise<string> {
  setEnv({
    AWS_ACCESS_KEY_ID: "AKIA_TEST",
    AWS_SECRET_ACCESS_KEY: "secret_test",
    ...env,
  });

  const mod = await import(`./resolveIdentityViaRekognition.ts?region_case=${++caseCounter}`);

  const originalFetch = globalThis.fetch;
  let rekHost = "";
  globalThis.fetch = ((input: string | URL | Request, _init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.includes("rekognition.")) {
      rekHost = new URL(url).host;
      // Zero faces → the resolver returns early, no CompareFaces needed.
      return Promise.resolve(new Response(JSON.stringify({ FaceDetails: [] }), { status: 200 }));
    }
    return Promise.resolve(new Response(PNG_1X1, { status: 200 }));
  }) as typeof fetch;

  try {
    await mod.resolveIdentityViaRekognition({
      anchorUrl: "https://example.test/anchor.png",
      characters: [{ characterId: "c1", portraitUrl: "https://example.test/p1.png", speakerIdx: 0 }],
      anchorWidth: 1024,
      anchorHeight: 1024,
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  return rekHost;
}

Deno.test("R1 — valid AWS_REGION eu-central-1 is accepted unchanged", async () => {
  const host = await resolveEndpointHost({ AWS_REGION: "eu-central-1", REKOGNITION_REGION: undefined });
  assertEquals(host, "rekognition.eu-central-1.amazonaws.com");
});

Deno.test("R2 — valid AWS_REGION us-east-1 is accepted unchanged", async () => {
  const host = await resolveEndpointHost({ AWS_REGION: "us-east-1", REKOGNITION_REGION: undefined });
  assertEquals(host, "rekognition.us-east-1.amazonaws.com");
});

Deno.test("R3 — invalid AWS_REGION 'Global' falls back to eu-central-1", async () => {
  const host = await resolveEndpointHost({ AWS_REGION: "Global", REKOGNITION_REGION: undefined });
  assertEquals(host, "rekognition.eu-central-1.amazonaws.com");
});

Deno.test("R4 — empty/whitespace region env falls back to eu-central-1", async () => {
  const host = await resolveEndpointHost({ AWS_REGION: "   ", REKOGNITION_REGION: "" });
  assertEquals(host, "rekognition.eu-central-1.amazonaws.com");
});

Deno.test("R5 — REKOGNITION_REGION keeps priority over AWS_REGION", async () => {
  const host = await resolveEndpointHost({ AWS_REGION: "us-east-1", REKOGNITION_REGION: "eu-west-1" });
  assertEquals(host, "rekognition.eu-west-1.amazonaws.com");
});

Deno.test("R6 — module import raises no ReferenceError (AWS_REGION_PATTERN regression)", async () => {
  setEnv({ AWS_REGION: "Global", REKOGNITION_REGION: undefined, AWS_ACCESS_KEY_ID: "", AWS_SECRET_ACCESS_KEY: "" });
  const mod = await import(`./resolveIdentityViaRekognition.ts?region_case=${++caseCounter}`);
  assertEquals(typeof mod.resolveIdentityViaRekognition, "function");
  const res = await mod.resolveIdentityViaRekognition({ anchorUrl: "", characters: [] });
  assertStringIncludes(String(res.reason), "aws_credentials_missing");
});
