import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * v430 Step 5A — Legacy-only Writer Inventory Contract.
 *
 * Goal: freeze the inventory of legacy-only writers. A legacy-only writer is
 * any edge-function path that writes `clip_status`, `twoshot_stage` or
 * `lip_sync_status` directly without also calling `composer_scene_transition()`
 * (or the `transitionScene()` helper).
 *
 * Two allowlists are maintained:
 *   1. `LIP_SYNC_LEGACY_ONLY` — the protected lip-sync chain. These paths are
 *      intentionally left on legacy columns in v430 and will be migrated in v431.
 *   2. `KNOWN_NON_LIP_SYNC_LEGACY_ONLY` — non-lip-sync paths that still write
 *      legacy columns in v430. Step 5B migrates the ones listed in the plan;
 *      the rest are documented here as known technical debt and must not grow.
 *
 * Any file outside both lists that writes legacy columns without a transition
 * call makes this test fail.
 */

const EDGE_ROOT = path.resolve(__dirname, "../../../../supabase/functions");

/** Lip-sync chain — protected by the v398/v425 contracts. */
const LIP_SYNC_LEGACY_ONLY: string[] = [
  "compose-dialog-segments",
  "sync-so-webhook",
  "lipsync-watchdog",
  "compose-twoshot-audio",
  "render-sync-segments-audio-mux",
  "_shared/lipsync-fail.ts",
  "reset-lipsync-scene",
  "cancel-dialog-lipsync",
  "report-lipsync-motion-probe",
];

/**
 * Non-lip-sync paths that still write legacy status columns in v430.
 * Step 5B of the plan migrates: qa-watchdog, recover-stuck-composer-clip,
 * remotion-webhook, generate-talking-head, compose-scene-anchor,
 * auto-director-compose, motion-studio-superuser, qa-weekly-deep-sweep,
 * autopilotComposerBridge.
 *
 * The remaining entries are large dispatchers/shared helpers that already
 * participate in the state machine implicitly (via the DB bridge) but do not
 * yet call `composer_scene_transition()` explicitly. They are frozen here so
 * no additional paths join this list.
 */
const KNOWN_NON_LIP_SYNC_LEGACY_ONLY: string[] = [
  // Step 5B targets — now dualised via pipeline_state / pipeline_substate.
  // Kept here as documentation until v431 removes the legacy columns entirely.

  // Large dispatchers/helpers that rely on the DB bridge today.
  // They are NOT lip-sync paths and are NOT migrated in v430.
  "compose-video-clips",
  "compose-clip-webhook",
  "compose-stitch-and-handoff",
  "compose-video-assemble",
  "_shared/scene-run-begin.ts",
  "_shared/continuity-chain.ts",
  "_shared/resolve-scene-output.ts",
  "composer-reset-selftest",
];

const LEGACY_COLUMNS = ["clip_status", "twoshot_stage", "lip_sync_status"];

function findTsFiles(dir: string): string[] {
  const out: string[] = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...findTsFiles(full));
    } else if (entry.isFile() && full.endsWith(".ts")) {
      out.push(full);
    }
  }
  return out;
}

function relativeEdgePath(fullPath: string): string {
  return path.relative(EDGE_ROOT, fullPath).replace(/\\/g, "/");
}

function pathMatchesList(relPath: string, list: string[]): boolean {
  return list.some((allow) => {
    if (relPath === allow) return true;
    if (allow.endsWith(".ts")) return relPath === allow;
    const dirPart = path.dirname(relPath);
    return dirPart === allow || dirPart.startsWith(allow + "/");
  });
}

function isAllowedLegacyOnly(relPath: string): boolean {
  return pathMatchesList(relPath, LIP_SYNC_LEGACY_ONLY) || pathMatchesList(relPath, KNOWN_NON_LIP_SYNC_LEGACY_ONLY);
}

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
}

function hasLegacyWrite(source: string): boolean {
  const code = stripComments(source);
  return LEGACY_COLUMNS.some((col) => {
    // Object key: clip_status: or "clip_status":
    const keyPattern = new RegExp(`['"]${col}['"]\\s*:`);
    // Direct assignment outside object: twoshot_stage = ...
    const assignmentPattern = new RegExp(`\\b${col}\\s*=`);
    return keyPattern.test(code) || assignmentPattern.test(code);
  });
}

function hasTransitionCall(source: string): boolean {
  // Explicit transition RPC/helper, the v430 materializer, or a direct
  // pipeline_state / pipeline_substate write on insert/update. Any of these
  // count as a dual writer because the modern state columns are being
  // authored alongside the legacy compatibility columns.
  return (
    /composer_scene_transition\s*\(/.test(source) ||
    /transitionScene\s*\(/.test(source) ||
    /materializeCompatibilityOutput\s*\(/.test(source) ||
    /['"]pipeline_state['"]\s*:/.test(source) ||
    /['"]pipeline_substate['"]\s*:/.test(source)
  );
}

describe("v430 Step 5A — Legacy-only writer allowlist", () => {
  const files = findTsFiles(EDGE_ROOT);

  it("should find edge function source files", () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it("should not allow new legacy-only writers outside the allowlists", () => {
    const offenders: { path: string; reason: string }[] = [];

    for (const fullPath of files) {
      const rel = relativeEdgePath(fullPath);
      const source = fs.readFileSync(fullPath, "utf-8");

      if (!hasLegacyWrite(source)) continue;

      // Paths on the allowlists are permitted to remain legacy-only in v430.
      if (isAllowedLegacyOnly(rel)) continue;

      // Paths that already call composer_scene_transition() are dual writers
      // and therefore not legacy-only.
      if (hasTransitionCall(source)) continue;

      offenders.push({
        path: rel,
        reason: "writes legacy status columns without composer_scene_transition()",
      });
    }

    if (offenders.length > 0) {
      const list = offenders.map((o) => `  - ${o.path}: ${o.reason}`).join("\n");
      throw new Error(
        `New legacy-only writer(s) detected outside the v430 allowlists.\n` +
          `Either migrate them via composer_scene_transition() or add them to the correct allowlist with a documented reason.\n` +
          `Offenders:\n${list}`,
      );
    }
  });

  it("should verify the lip-sync allowlist entries still exist as files or directories", () => {
    for (const allow of LIP_SYNC_LEGACY_ONLY) {
      const full = path.join(EDGE_ROOT, allow);
      expect(fs.existsSync(full), `Lip-sync allowlist entry does not exist: ${allow}`).toBe(true);
    }
  });
});
