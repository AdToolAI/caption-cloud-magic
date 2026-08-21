#!/usr/bin/env bun
/**
 * V434 Step 2 — calibration manifest verifier / threshold deriver.
 *
 * Usage (bun resolves the shared Deno TS module directly):
 *   bun scripts/calibration/v434-manifest.mjs
 *   bun scripts/calibration/v434-manifest.mjs --json
 *
 * Exit codes: 0 = manifest structurally valid, 1 = invalid manifest.
 * A "no threshold derived" result is NOT an error — it is the correct outcome
 * while the reproducible sample set is still being rebuilt.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  validateManifest,
  deriveMadRatioThreshold,
} from "../../supabase/functions/_shared/v434-calibration-manifest.ts";

const here = dirname(fileURLToPath(import.meta.url));
const manifestPath = resolve(here, "v434/manifest.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

const validation = validateManifest(manifest);
const derivation = deriveMadRatioThreshold(manifest);

if (process.argv.includes("--json")) {
  console.log(JSON.stringify({ manifestPath, validation, derivation }, null, 2));
} else {
  console.log(`manifest: ${manifestPath}`);
  console.log(`valid: ${validation.ok}${validation.ok ? "" : " — " + validation.errors.join(", ")}`);
  console.log(
    `samples: reproducible=${validation.reproducible} legacy_non_reproducible=${validation.legacy} pending=${validation.pending}`,
  );
  console.log(`derivation: ${derivation.status} — ${derivation.reason}`);
  if (derivation.status === "derived") {
    console.log(
      `  noop_max=${derivation.noop_max} motion_min=${derivation.motion_min} gap=${derivation.gap} candidate_threshold=${derivation.threshold}`,
    );
    console.log("  STATUS: candidate only. NOT authoritative until promoted by a separate gate.");
  }
}

process.exit(validation.ok ? 0 : 1);
