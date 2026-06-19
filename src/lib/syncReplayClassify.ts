/**
 * Root-cause classifier for syncso-replay-lab results.
 *
 * Input: rows from `syncso_replay_log` for one lab batch (one row per
 * preset). Output: a single verdict object describing the most likely
 * root cause of `generation_unknown_error`, derived purely from which
 * variants succeeded vs failed.
 */

export type ReplayStatus =
  | "dispatching"
  | "dispatched"
  | "completed"
  | "failed"
  | "dispatch_failed"
  | "dispatch_crash"
  | "config_error"
  | "fanout_crash"
  | string
  | null;

export interface ReplayRow {
  override_preset: string;
  provider_status: ReplayStatus;
  provider_error?: string | null;
  provider_error_code?: string | null;
  output_url?: string | null;
}

export type VariantOutcome = "pass" | "fail" | "pending" | "missing";

export interface Verdict {
  ready: boolean;          // all variants reached a terminal state
  outcomes: Record<string, VariantOutcome>;
  rootCause:
    | "baseline_passed_transient"
    | "sync_mode_cut_off"
    | "asd_coords_or_frame"
    | "single_coord_vs_bbox_path"
    | "sync3_model_incompat"
    | "provider_asset_incompat"
    | "indeterminate";
  rootCauseLabel: string;
  recommendedFix: string;
  notes: string[];
}

const TERMINAL_PASS = new Set(["completed"]);
const TERMINAL_FAIL = new Set([
  "failed",
  "dispatch_failed",
  "dispatch_crash",
  "config_error",
  "fanout_crash",
]);

function outcomeOf(row: ReplayRow | undefined): VariantOutcome {
  if (!row) return "missing";
  const s = String(row.provider_status ?? "").toLowerCase();
  if (TERMINAL_PASS.has(s) && row.output_url) return "pass";
  if (TERMINAL_PASS.has(s)) return "pass"; // completed without output is rare; treat as pass
  if (TERMINAL_FAIL.has(s)) return "fail";
  return "pending";
}

export const LAB_PRESETS = [
  "exact",
  "omit_sync_mode",
  "auto_detect",
  "bboxes",
  "lipsync_2_pro",
] as const;

export function classifyReplayBatch(rows: ReplayRow[]): Verdict {
  const byPreset = new Map<string, ReplayRow>();
  for (const r of rows) byPreset.set(r.override_preset, r);

  const outcomes: Record<string, VariantOutcome> = {};
  for (const p of LAB_PRESETS) outcomes[p] = outcomeOf(byPreset.get(p));

  const ready = LAB_PRESETS.every(
    (p) => outcomes[p] === "pass" || outcomes[p] === "fail",
  );

  const notes: string[] = [];
  const exact = outcomes.exact;

  if (!ready) {
    return {
      ready,
      outcomes,
      rootCause: "indeterminate",
      rootCauseLabel: "Läuft noch …",
      recommendedFix: "Warte bis alle Varianten ein Endergebnis haben (~30–90 s pro Variante).",
      notes,
    };
  }

  // Baseline passed → original failure was transient/flaky on the provider side
  if (exact === "pass") {
    notes.push("Exact-Reproducer war diesmal erfolgreich → ursprünglicher Fehler war transient.");
    return {
      ready,
      outcomes,
      rootCause: "baseline_passed_transient",
      rootCauseLabel: "Transienter Provider-Fehler",
      recommendedFix:
        "Kein deterministischer Bug nachweisbar. Retry-Logik darf provider_unknown_error 1× weicher behandeln, statt sofort die ganze Szene zu killen.",
      notes,
    };
  }

  // exact failed — figure out which variant rescued it
  const rescues: string[] = [];
  if (outcomes.omit_sync_mode === "pass") rescues.push("omit_sync_mode");
  if (outcomes.auto_detect === "pass") rescues.push("auto_detect");
  if (outcomes.bboxes === "pass") rescues.push("bboxes");
  if (outcomes.lipsync_2_pro === "pass") rescues.push("lipsync_2_pro");

  if (rescues.length === 0) {
    return {
      ready,
      outcomes,
      rootCause: "provider_asset_incompat",
      rootCauseLabel: "Provider-Asset-Inkompatibilität",
      recommendedFix:
        "Keine ASD-/Modell-/sync_mode-Variante hat es gerettet. Ursache liegt im Preclip oder Audio selbst (Container/Codec/Voiced-Window). Nächster Schritt: Codec-Renorm- und Audio-Trim-Varianten (separater ffmpeg-Lauf).",
      notes,
    };
  }

  // Prioritise the most specific signal
  if (outcomes.auto_detect === "pass" && outcomes.bboxes === "pass") {
    return {
      ready,
      outcomes,
      rootCause: "asd_coords_or_frame",
      rootCauseLabel: "ASD-Koordinaten oder Frame-Anchor falsch",
      recommendedFix:
        "Sowohl auto_detect als auch bboxes funktionieren — der gelieferte (coordinates, frame_number) Tupel zeigt nicht auf ein Gesicht im Preclip. Fix: coordinates in Preclip-Space transformieren UND frame_number auf einen validierten Mid-Frame zwingen.",
      notes,
    };
  }
  if (outcomes.auto_detect === "pass") {
    return {
      ready,
      outcomes,
      rootCause: "asd_coords_or_frame",
      rootCauseLabel: "ASD-Koordinaten/Frame falsch",
      recommendedFix:
        "auto_detect funktioniert → die expliziten Koordinaten/frame_number sind das Problem. Fix: für saubere Single-Face-Preclips auto_detect verwenden ODER coords in Preclip-Space transformieren und Frame mid-clip wählen.",
      notes,
    };
  }
  if (outcomes.bboxes === "pass") {
    return {
      ready,
      outcomes,
      rootCause: "single_coord_vs_bbox_path",
      rootCauseLabel: "Single-Coord-Pfad bricht — bbox-Pfad nicht",
      recommendedFix:
        "Per-Frame bounding_boxes funktionieren, single coordinates+frame_number nicht. Fix: für alle sync-3 Dispatches per-frame bounding_boxes verwenden statt coordinates+frame_number.",
      notes,
    };
  }
  if (outcomes.omit_sync_mode === "pass") {
    return {
      ready,
      outcomes,
      rootCause: "sync_mode_cut_off",
      rootCauseLabel: "sync_mode: cut_off triggert den Fehler",
      recommendedFix:
        "Ohne sync_mode läuft es durch → cut_off in Kombination mit dem aktuellen Audio/Video-Längenverhältnis killt den Job. Fix: Audio auf Preclip-Länge trimmen ODER sync_mode wechseln (`bounce` / weglassen).",
      notes,
    };
  }
  if (outcomes.lipsync_2_pro === "pass") {
    return {
      ready,
      outcomes,
      rootCause: "sync3_model_incompat",
      rootCauseLabel: "sync-3 selbst inkompatibel mit dieser Plate",
      recommendedFix:
        "lipsync-2-pro funktioniert mit denselben Assets. Fix: für diese Plate-Klasse Auto-Fallback auf lipsync-2-pro statt sync-3.",
      notes,
    };
  }

  return {
    ready,
    outcomes,
    rootCause: "indeterminate",
    rootCauseLabel: "Unklar",
    recommendedFix: "Mehrere Pässe widersprüchlich. Logs einzeln prüfen.",
    notes,
  };
}
