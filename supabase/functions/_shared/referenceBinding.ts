/**
 * Seedance 2.5 / ModelArk — semantic reference binding.
 * --------------------------------------------------------------
 * Single source of truth for how UI reference slots become provider content.
 * Imported by the Edge Function (Deno) AND re-exported for the browser via
 * `src/lib/ai-video/referenceBinding.ts`, so index math can never drift.
 *
 * Invariants (covered by src/test/seedance25-reference-binding.test.ts):
 *  - UI slot order is preserved verbatim; no sorting, no hidden extra images.
 *  - ModelArk `content[0]` is the text block, so UI slot i (0-based) is
 *    provider `content[i + 1]` and is addressed as "@Image {i + 1}" in the
 *    prompt (ModelArk documents references by their 1-based image order).
 *  - Roles are turned into explicit instructions server-side; users never
 *    have to type `@ref-1` themselves.
 *  - Duplicate images (same URL or same content hash) are rejected before
 *    submission, so one asset never occupies two provider slots by accident.
 *
 * Pure TypeScript only: no Deno / browser globals.
 */

export const REFERENCE_ROLES = ["character", "product", "location", "style", "prop"] as const;
export type ReferenceRole = (typeof REFERENCE_ROLES)[number];

export interface ReferenceSlotInput {
  url: string;
  role?: string | null;
  /** Optional content fingerprint (client-side SHA-256) for duplicate detection. */
  hash?: string | null;
}

export interface BoundReferenceSlot {
  /** 0-based UI index (thumbnail order). */
  uiIndex: number;
  /** 1-based label used in the provider prompt ("@Image N"). */
  imageNumber: number;
  /** Index inside ModelArk `content[]` (text block is content[0]). */
  contentIndex: number;
  url: string;
  role: ReferenceRole | null;
}

export interface DuplicateReference {
  /** UI index of the slot that is a repeat. */
  uiIndex: number;
  /** UI index of the first occurrence it duplicates. */
  duplicateOf: number;
  by: "url" | "hash";
}

export const TEXT_CONTENT_INDEX = 0;

export function isReferenceRole(v: unknown): v is ReferenceRole {
  return typeof v === "string" && (REFERENCE_ROLES as readonly string[]).includes(v);
}

/** Normalizes a URL for identity comparison (query strings such as cache busters are ignored). */
export function referenceIdentity(url: string): string {
  const trimmed = (url ?? "").trim();
  const q = trimmed.indexOf("?");
  return (q >= 0 ? trimmed.slice(0, q) : trimmed).toLowerCase();
}

/**
 * Detects duplicate reference images. Order-stable: the FIRST occurrence is
 * kept as the original, later ones are reported as duplicates.
 */
export function findDuplicateReferences(slots: ReferenceSlotInput[]): DuplicateReference[] {
  const seenUrl = new Map<string, number>();
  const seenHash = new Map<string, number>();
  const out: DuplicateReference[] = [];
  slots.forEach((slot, i) => {
    const id = referenceIdentity(slot.url);
    const hash = (slot.hash ?? "").trim().toLowerCase();
    if (id && seenUrl.has(id)) {
      out.push({ uiIndex: i, duplicateOf: seenUrl.get(id)!, by: "url" });
      return;
    }
    if (hash && seenHash.has(hash)) {
      out.push({ uiIndex: i, duplicateOf: seenHash.get(hash)!, by: "hash" });
      return;
    }
    if (id) seenUrl.set(id, i);
    if (hash) seenHash.set(hash, i);
  });
  return out;
}

/**
 * Pairs URLs with roles by position. `roles` may be shorter than `urls`
 * (missing roles become `null`); it is never allowed to be longer — a role
 * without an image would silently shift indices.
 */
export function bindReferenceSlots(
  urls: readonly string[],
  roles?: readonly (string | null | undefined)[] | null,
): BoundReferenceSlot[] {
  const clean = urls.filter((u): u is string => typeof u === "string" && u.trim().length > 0);
  if (roles && roles.length > clean.length) {
    throw new Error(
      `reference roles (${roles.length}) exceed reference images (${clean.length}) — index binding would be ambiguous`,
    );
  }
  return clean.map((url, i) => {
    const role = roles?.[i];
    return {
      uiIndex: i,
      imageNumber: i + 1,
      contentIndex: i + 1,
      url,
      role: isReferenceRole(role) ? role : null,
    };
  });
}

const ROLE_SENTENCE: Record<ReferenceRole, (n: number) => string> = {
  character: (n) =>
    `@Image ${n} is the main character: keep this exact face, hairstyle, body type and outfit consistent in every frame.`,
  product: (n) =>
    `@Image ${n} is the product: reproduce its shape, colors, materials, labels and proportions faithfully; do not redesign it.`,
  location: (n) =>
    `@Image ${n} is the location/environment: stage the scene in this place with its architecture, lighting and atmosphere.`,
  style: (n) =>
    `@Image ${n} defines the visual style only: match its color grading, lighting mood and look, do not copy its subjects.`,
  prop: (n) =>
    `@Image ${n} is a prop: include this object as shown, with the same design and details.`,
};

/**
 * Builds the provider-facing reference instructions. Deterministic: the same
 * ordered slots always produce the same text, so a reload/resume that
 * restores the same slots re-creates the identical binding.
 */
export function buildReferenceInstructions(slots: readonly BoundReferenceSlot[]): string {
  if (slots.length === 0) return "";
  const lines = slots.map((s) =>
    s.role
      ? ROLE_SENTENCE[s.role](s.imageNumber)
      : `@Image ${s.imageNumber} is a reference: use it as a visual anchor for the described scene.`,
  );
  return [`[REFERENCES] ${slots.length} reference image${slots.length === 1 ? "" : "s"} are attached in this order:`, ...lines].join("\n");
}

/** Prompt + instructions in the exact order sent to the provider. */
export function composeReferencePrompt(userPrompt: string, slots: readonly BoundReferenceSlot[]): string {
  const base = (userPrompt ?? "").trim();
  const instr = buildReferenceInstructions(slots);
  return instr ? `${base}\n\n${instr}` : base;
}

const CONTENT_INDEX_RE = /content\[(\d+)\]/i;

/** Extracts the `content[N]` index from a raw ModelArk error, if present. */
export function parseModelArkContentIndex(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const m = CONTENT_INDEX_RE.exec(raw);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

/**
 * Maps a provider `content[N]` index back to the UI reference slot. Returns
 * `null` for the text block, out-of-range indices, or non-image entries.
 */
export function contentIndexToReferenceSlot(
  contentIndex: number | null,
  slots: readonly BoundReferenceSlot[],
): BoundReferenceSlot | null {
  if (contentIndex === null || contentIndex <= TEXT_CONTENT_INDEX) return null;
  return slots.find((s) => s.contentIndex === contentIndex) ?? null;
}

export interface RejectedReferenceInfo {
  contentIndex: number;
  /** 0-based UI index. */
  uiIndex: number;
  /** 1-based label ("image 2"). */
  imageNumber: number;
  role: ReferenceRole | null;
}

export function resolveRejectedReference(
  rawError: string | null | undefined,
  slots: readonly BoundReferenceSlot[],
): RejectedReferenceInfo | null {
  const idx = parseModelArkContentIndex(rawError);
  const slot = contentIndexToReferenceSlot(idx, slots);
  if (!slot || idx === null) return null;
  return { contentIndex: idx, uiIndex: slot.uiIndex, imageNumber: slot.imageNumber, role: slot.role };
}
