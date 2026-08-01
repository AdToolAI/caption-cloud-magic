export interface PlateCrop {
  x: number;
  y: number;
  size: number;
  outputSize: number;
}

export interface ReprojectionPass {
  speakerIdx: number;
  characterId: string;
  crop: PlateCrop;
}

export interface ReprojectionValidation {
  ok: boolean;
  errors: string[];
  passes: ReprojectionPass[];
}

function finitePositive(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * v368 native-plate contract.
 *
 * `x`, `y` and `size` always stay in source-plate pixels. `outputSize` is
 * only the square Sync.so working resolution and must never affect paste-back
 * placement. This parser is the single boundary between persisted pass JSON
 * and the Remotion mux payload.
 */
export function parseReprojectionPass(pass: Record<string, unknown>): ReprojectionPass | null {
  const speakerIdx = Number(pass.speaker_idx);
  const characterId = typeof pass.character_id === "string" ? pass.character_id.trim() : "";
  const rawCrop = pass.preclip_crop as Record<string, unknown> | null | undefined;
  const x = rawCrop ? Number(rawCrop.x) : NaN;
  const y = rawCrop ? Number(rawCrop.y) : NaN;
  const size = rawCrop ? finitePositive(rawCrop.size) : null;
  const outputSize = rawCrop ? finitePositive(rawCrop.outputSize) : null;

  if (
    !Number.isInteger(speakerIdx) || speakerIdx < 0 || !characterId ||
    !Number.isFinite(x) || x < 0 || !Number.isFinite(y) || y < 0 ||
    size === null
  ) {
    return null;
  }

  return {
    speakerIdx,
    characterId,
    crop: { x, y, size, outputSize: outputSize ?? 720 },
  };
}

function sameTarget(a: PlateCrop, b: PlateCrop): boolean {
  const acx = a.x + a.size / 2;
  const acy = a.y + a.size / 2;
  const bcx = b.x + b.size / 2;
  const bcy = b.y + b.size / 2;
  const distance = Math.hypot(acx - bcx, acy - bcy);
  return distance < Math.min(a.size, b.size) * 0.25;
}

export function validateReprojectionPasses(
  rawPasses: Array<Record<string, unknown>>,
  plateWidth: number,
  plateHeight: number,
): ReprojectionValidation {
  const errors: string[] = [];
  const passes: ReprojectionPass[] = [];
  const speakers = new Set<number>();
  const characters = new Set<string>();

  for (const raw of rawPasses) {
    const parsed = parseReprojectionPass(raw);
    if (!parsed) {
      errors.push(`invalid_pass:${String(raw?.speaker_idx ?? "unknown")}`);
      continue;
    }
    if (speakers.has(parsed.speakerIdx)) errors.push(`duplicate_speaker:${parsed.speakerIdx}`);
    if (characters.has(parsed.characterId)) errors.push(`duplicate_character:${parsed.characterId}`);
    if (
      parsed.crop.x + parsed.crop.size > plateWidth + 1 ||
      parsed.crop.y + parsed.crop.size > plateHeight + 1
    ) {
      errors.push(`crop_outside_plate:${parsed.speakerIdx}`);
    }
    for (const prior of passes) {
      if (sameTarget(parsed.crop, prior.crop)) {
        errors.push(`target_collision:${prior.speakerIdx}:${parsed.speakerIdx}`);
      }
    }
    speakers.add(parsed.speakerIdx);
    characters.add(parsed.characterId);
    passes.push(parsed);
  }

  return { ok: errors.length === 0 && passes.length === rawPasses.length, errors, passes };
}