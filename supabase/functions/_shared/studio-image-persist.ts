/**
 * Single source of truth for how a Picture Studio asset is written to
 * `studio_images`.
 *
 * Two rules that this module enforces:
 *
 *  1. `workflow_type` is mandatory. There is NO silent fallback — a caller that
 *     forgets it fails loudly instead of quietly mislabelling the asset as
 *     "generated" forever.
 *  2. A persistence failure AFTER a successful provider run is not a free run.
 *     The insert is retried idempotently; when it still fails the caller keeps
 *     the charge, marks the run `asset_persist_failed` and hands back the
 *     provider URL so the output is never lost.
 */

export const WORKFLOW_TYPES = [
  "generated",
  "edited",
  "enhanced",
  "background",
  "restored",
  "colorized",
  "uploaded",
] as const;

export type WorkflowType = (typeof WORKFLOW_TYPES)[number];

export function isWorkflowType(value: unknown): value is WorkflowType {
  return typeof value === "string" && (WORKFLOW_TYPES as readonly string[]).includes(value);
}

/**
 * The ONLY place that maps an enhance model to its workflow. Never duplicate
 * this mapping in the frontend — read `workflow_type` from the row instead.
 */
export function getWorkflowTypeForEnhanceModel(modelId: string): WorkflowType {
  switch (modelId) {
    case "topaz-image-upscale":
    case "clarity-pro":
    case "clarity-upscaler":
      return "enhanced";
    case "topaz-dust-scratch":
      return "restored";
    case "topaz-colorization":
      return "colorized";
    default:
      throw new Error(`UNSUPPORTED_MODEL: no workflow_type mapping for "${modelId}"`);
  }
}

export interface StudioImageRow {
  user_id: string;
  image_url: string;
  workflow_type: WorkflowType;
  prompt?: string | null;
  style?: string | null;
  model_used?: string | null;
  aspect_ratio?: string | null;
  source?: string;
  album_id?: string | null;
  parent_id?: string | null;
  source_run_id?: string | null;
  upscale_factor?: number | null;
  variation_index?: number | null;
  thumbnail_url?: string | null;
  metadata_json?: Record<string, unknown> | null;
}

export interface PersistResult {
  ok: boolean;
  /** Inserted row id, when the insert succeeded. */
  id: string | null;
  error?: string;
}

type MinimalClient = {
  from: (table: string) => {
    insert: (row: Record<string, unknown>) => {
      select: () => { single: () => Promise<{ data: { id: string } | null; error: { message: string } | null }> };
    };
  };
};

export const MAX_PERSIST_ATTEMPTS = 3;

/**
 * Inserts exactly one media-library row for a finished Picture Studio output.
 * Retries transient failures; never charges the provider twice (this function
 * only touches the database).
 */
export async function persistStudioImage(
  client: MinimalClient,
  row: StudioImageRow,
  logPrefix = "[studio-image]",
): Promise<PersistResult> {
  if (!isWorkflowType(row.workflow_type)) {
    // Programming error — surfaced immediately, never defaulted away.
    throw new Error(`MISSING_WORKFLOW_TYPE: "${String(row.workflow_type)}" is not a valid workflow_type`);
  }

  let lastError = "unknown error";
  for (let attempt = 1; attempt <= MAX_PERSIST_ATTEMPTS; attempt++) {
    const { data, error } = await client
      .from("studio_images")
      .insert({ source: "generated", ...row })
      .select()
      .single();
    if (!error && data?.id) return { ok: true, id: data.id };
    lastError = error?.message ?? "insert returned no row";
    console.warn(`${logPrefix} persist attempt ${attempt}/${MAX_PERSIST_ATTEMPTS} failed: ${lastError}`);
    if (attempt < MAX_PERSIST_ATTEMPTS) {
      await new Promise((r) => setTimeout(r, attempt * 400));
    }
  }
  return { ok: false, id: null, error: lastError };
}
