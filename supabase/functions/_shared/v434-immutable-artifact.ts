/**
 * V434 STEP 1 — IMMUTABLE ARTIFACT PATHS PER RUN/PASS
 * ---------------------------------------------------------------------------
 * Root cause recorded in `docs/v433-motion-studio-rca.md`:
 *   Provider outputs and pre-clips were re-hosted under a MUTABLE object key
 *   (`composer/<uid>/<sceneId>-lipsync-pass-<n>.mp4`). A later run of the same
 *   scene/pass silently OVERWROTE the bytes behind a URL that older ledger
 *   rows, calibration samples and RCA evidence still pointed at. The v404
 *   calibration was therefore fitted against phantom samples: the stored URL
 *   no longer contained the bytes that produced the stored metric.
 *
 * This module is PURE + I/O, and additive:
 *   - `buildImmutableArtifactKey()` is a pure, deterministic key builder that
 *     includes run id, plate generation, pass index and attempt. The same
 *     (run, generation, pass, attempt, kind) tuple always maps to the same key;
 *     two different runs can NEVER map to the same key.
 *   - `pinImmutableArtifact()` writes bytes ONCE (`upsert: false`) and records
 *     the sha256 of the exact bytes, so any later evidence can be verified.
 *
 * It MUST NOT change what production plays back. The legacy mutable URL stays
 * the authoritative playback/mux URL for the frozen FA-4 path; the pinned copy
 * is evidence-grade, immutable, and referenced only from telemetry.
 */

export const V434_ARTIFACT_ROOT = "v434";
export const V434_ARTIFACT_BUCKET = "ai-videos";

export type V434ArtifactKind =
  | "provider-output"
  | "preclip"
  | "plate"
  | "mux";

export interface ImmutableArtifactKeyArgs {
  userId: string;
  sceneId: string;
  /** `dialog_shots.active_run_id` — the run identity stamped by beginSceneRun(). */
  runId: string;
  /** `plate_generation` at dispatch time. */
  generation: number;
  passIdx: number;
  kind: V434ArtifactKind;
  /** Provider attempt within the pass (0-based). Distinguishes retries. */
  attempt?: number;
  /** File extension WITHOUT the dot. */
  ext?: string;
}

/** Filesystem/storage-safe slug. Never empty — unknown parts become `unknown`. */
export function safeSegment(value: unknown): string {
  const s = String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return s.length > 0 ? s.slice(0, 64) : "unknown";
}

/**
 * PURE. Deterministic immutable storage key.
 *
 * Shape:
 *   <uid>/v434/<sceneId>/run-<runId>/gen-<generation>/pass-<passIdx>/<kind>-a<attempt>.<ext>
 *
 * Every mutable dimension of the old scheme (scene + pass only) is now
 * qualified by run id, plate generation and attempt.
 */
export function buildImmutableArtifactKey(args: ImmutableArtifactKeyArgs): string {
  const uid = safeSegment(args.userId);
  const scene = safeSegment(args.sceneId);
  const run = safeSegment(args.runId);
  const gen = Number.isFinite(Number(args.generation)) ? Math.max(0, Math.trunc(Number(args.generation))) : 0;
  const pass = Number.isFinite(Number(args.passIdx)) ? Math.max(0, Math.trunc(Number(args.passIdx))) : 0;
  const attempt = Number.isFinite(Number(args.attempt)) ? Math.max(0, Math.trunc(Number(args.attempt))) : 0;
  const kind = safeSegment(args.kind);
  const ext = safeSegment(args.ext ?? "mp4");
  return `${uid}/${V434_ARTIFACT_ROOT}/${scene}/run-${run}/gen-${gen}/pass-${pass}/${kind}-a${attempt}.${ext}`;
}

/** PURE. True when the key carries a run + generation + attempt qualifier. */
export function isImmutableArtifactKey(key: string): boolean {
  return /\/v434\/[^/]+\/run-[^/]+\/gen-\d+\/pass-\d+\/[a-z0-9-]+-a\d+(-[0-9a-f]{8})?\.[a-z0-9]+$/.test(
    String(key ?? ""),
  );
}

/**
 * V465-B2a — PURE. The attempt qualifier of a pass.
 *
 * The old `pass.attempt ?? 0` was always 0 in production, so every NOOP-ladder
 * retry of the same pass mapped onto ONE immutable key. With `upsert: false`
 * the second and later provider outputs were silently DROPPED — which is
 * exactly why the S01 grey cases had no evidence. We therefore derive the
 * attempt from every counter the pass actually carries.
 */
export function resolveArtifactAttempt(pass: unknown): number {
  const p = (pass ?? {}) as Record<string, unknown>;
  const candidates: unknown[] = [
    p.attempt,
    p.attempt_idx,
    Array.isArray(p.attempts) ? p.attempts.length - 1 : undefined,
    p.noop_attempts,
    p.provider_attempts,
    p.retry_count,
    p.retries,
  ];
  let best = 0;
  for (const c of candidates) {
    const n = Number(c);
    if (Number.isFinite(n) && n > best) best = Math.trunc(n);
  }
  return best;
}

/** PURE. Content-qualified sibling key used when an attempt key collides. */
export function variantArtifactKey(key: string, sha256: string): string {
  const dot = key.lastIndexOf(".");
  const base = dot > 0 ? key.slice(0, dot) : key;
  const ext = dot > 0 ? key.slice(dot) : "";
  return `${base}-${String(sha256 ?? "").slice(0, 8)}${ext}`;
}

/** PURE. Lowercase hex sha256 of raw bytes (Web Crypto). */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const copy = new Uint8Array(bytes.length);
  copy.set(bytes);
  const digest = await crypto.subtle.digest("SHA-256", copy.buffer as ArrayBuffer);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export interface PinnedArtifact {
  ok: boolean;
  key: string | null;
  url: string | null;
  sha256: string | null;
  bytes: number | null;
  /** `written` | `already_pinned` | a failure reason. */
  status: string;
}

export interface PinArtifactArgs {
  supabase: any;
  sourceUrl: string;
  key: string;
  bucket?: string;
  contentType?: string;
  downloadTimeoutMs?: number;
}

/**
 * Downloads `sourceUrl` and pins the exact bytes at `key` with `upsert: false`.
 *
 * NEVER throws and NEVER mutates scene state — a pin failure must not be able
 * to break a production webhook. A pre-existing object is treated as success
 * (`already_pinned`) because immutable keys are content-stable by construction.
 */
export async function pinImmutableArtifact(args: PinArtifactArgs): Promise<PinnedArtifact> {
  const bucket = args.bucket ?? V434_ARTIFACT_BUCKET;
  const fail = (status: string): PinnedArtifact => ({
    ok: false,
    key: args.key,
    url: null,
    sha256: null,
    bytes: null,
    status,
  });
  try {
    if (!args.sourceUrl) return fail("pin_skipped:source_url_missing");
    if (!isImmutableArtifactKey(args.key)) return fail("pin_skipped:key_not_immutable");

    const publicUrlOf = (): string | null => {
      try {
        const { data } = args.supabase.storage.from(bucket).getPublicUrl(args.key);
        return data?.publicUrl ?? null;
      } catch {
        return null;
      }
    };

    const dl = await fetch(args.sourceUrl, {
      signal: AbortSignal.timeout(Math.max(1_000, args.downloadTimeoutMs ?? 60_000)),
    });
    if (!dl.ok) return fail(`pin_failed:download_${dl.status}`);
    const bytes = new Uint8Array(await dl.arrayBuffer());
    if (bytes.byteLength < 1024) return fail("pin_failed:artifact_too_small");
    const digest = await sha256Hex(bytes);

    const up = await args.supabase.storage.from(bucket).upload(args.key, bytes, {
      contentType: args.contentType ?? "video/mp4",
      upsert: false,
    });
    if (up?.error) {
      const msg = String(up.error?.message ?? "");
      const exists = /exist/i.test(msg) || Number(up.error?.statusCode) === 409;
      if (!exists) return fail(`pin_failed:upload_${msg.slice(0, 80) || "unknown"}`);

      // ── V465-B2a — never lose evidence on a key collision ───────────────
      // A pre-existing object with the SAME sha is a genuine idempotent
      // re-delivery. A pre-existing object with DIFFERENT bytes means a second
      // provider output for the same (run, gen, pass, attempt) tuple — that
      // one used to be silently dropped. It is now pinned under a
      // content-qualified sibling key instead.
      let existingDigest: string | null = null;
      try {
        const cur = await args.supabase.storage.from(bucket).download(args.key);
        if (cur?.data) {
          existingDigest = await sha256Hex(new Uint8Array(await cur.data.arrayBuffer()));
        }
      } catch { /* treat as unknown */ }

      if (existingDigest && existingDigest !== digest) {
        const altKey = variantArtifactKey(args.key, digest);
        const alt = await args.supabase.storage.from(bucket).upload(altKey, bytes, {
          contentType: args.contentType ?? "video/mp4",
          upsert: false,
        });
        const altErr = String(alt?.error?.message ?? "");
        if (alt?.error && !/exist/i.test(altErr) && Number(alt?.error?.statusCode) !== 409) {
          return fail(`pin_failed:variant_upload_${altErr.slice(0, 60) || "unknown"}`);
        }
        let altUrl: string | null = null;
        try {
          altUrl = args.supabase.storage.from(bucket).getPublicUrl(altKey)?.data?.publicUrl ?? null;
        } catch { /* noop */ }
        return {
          ok: true,
          key: altKey,
          url: altUrl,
          sha256: digest,
          bytes: bytes.byteLength,
          status: "pinned_variant",
        };
      }

      return {
        ok: true,
        key: args.key,
        url: publicUrlOf(),
        sha256: digest,
        bytes: bytes.byteLength,
        status: existingDigest ? "already_pinned" : "already_pinned_unverified",
      };
    }
    return {
      ok: true,
      key: args.key,
      url: publicUrlOf(),
      sha256: digest,
      bytes: bytes.byteLength,
      status: "written",
    };
  } catch (err) {
    return fail(`pin_failed:${(err as Error).message?.slice(0, 80) || "unknown"}`);
  }
}
