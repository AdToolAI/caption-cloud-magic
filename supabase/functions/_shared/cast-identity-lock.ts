/**
 * cast-identity-lock.ts (v349)
 * ============================
 * One entry point for "which face on this plate/anchor belongs to which
 * Cast & World character", backed by an AWS Rekognition Face Collection.
 *
 * Responsibilities
 * ----------------
 *  1. Keep the per-user collection in sync with the character portraits
 *     (index once, re-index only when the portrait bytes change).
 *  2. Identify every face in the supplied frame against that collection.
 *  3. Return a verdict the dispatcher can act on WITHOUT guessing:
 *       ok            → bijective speaker ↔ face mapping
 *       duplicate     → one character owns two faces (rendered twice)
 *       missing       → a cast member has no face in the frame
 *       unavailable   → AWS/measurement outage (caller keeps its old path)
 *
 * Rekognition cannot read MP4 bytes, so identification runs on the still
 * anchor / reference image — the same image the plate was generated from and
 * the same one every other detector in this pipeline uses.
 */

import {
  collectionIdForUser,
  ensureCollection,
  faceCollectionAvailable,
  identifyFacesInFrame,
  indexCharacterPortrait,
  type IdentifiedFace,
} from "./rekognition-face-collection.ts";
import { compareAspect, projectNormBox } from "./rek-image-space.ts";

export const CAST_IDENTITY_LOCK_TAG = "v349-cast-identity-lock";

export interface CastMember {
  characterId: string;
  portraitUrl: string;
  speakerIdx: number;
  name?: string;
}

export type CastIdentityVerdict = "ok" | "duplicate" | "missing" | "unavailable";

export interface CastIdentityLockResult {
  verdict: CastIdentityVerdict;
  method: typeof CAST_IDENTITY_LOCK_TAG;
  /** speakerIdx (as string) → characterId. Only bijective matches. */
  assignmentLock: Record<string, string>;
  /** speakerIdx → identified face (pixel bbox in the supplied frame). */
  facesBySpeaker: Record<string, IdentifiedFace>;
  /** All detected faces, row-major. */
  faces: IdentifiedFace[];
  duplicateCharacterIds: string[];
  missingCharacterIds: string[];
  indexedCount: number;
  detectedCount: number;
  resolvedCount: number;
  reason?: string;
  msTotal: number;
}

/** Ensures every cast member's portrait is indexed. Returns how many are usable. */
async function syncPortraits(params: {
  // deno-lint-ignore no-explicit-any
  supabase: any;
  collectionId: string;
  cast: CastMember[];
}): Promise<{ indexed: number; problems: string[] }> {
  const { supabase, collectionId, cast } = params;
  const ids = cast.map((c) => c.characterId).filter(Boolean);
  if (ids.length === 0) return { indexed: 0, problems: ["no_character_ids"] };

  const { data: rows } = await supabase
    .from("brand_characters")
    .select("id, rekognition_face_ids, rekognition_collection_id, rekognition_portrait_hash")
    .in("id", ids);

  const byId = new Map<string, {
    rekognition_face_ids?: string[] | null;
    rekognition_collection_id?: string | null;
    rekognition_portrait_hash?: string | null;
  }>();
  for (const r of rows ?? []) byId.set(String(r.id), r);

  const problems: string[] = [];
  let indexed = 0;

  await Promise.all(cast.map(async (member) => {
    const row = byId.get(member.characterId);
    const alreadyIndexed =
      !!row?.rekognition_collection_id &&
      row.rekognition_collection_id === collectionId &&
      Array.isArray(row.rekognition_face_ids) &&
      row.rekognition_face_ids.length > 0;

    if (alreadyIndexed) { indexed++; return; }

    if (!member.portraitUrl) {
      problems.push(`${member.characterId}:no_portrait_url`);
      return;
    }

    const res = await indexCharacterPortrait({
      collectionId,
      characterId: member.characterId,
      portraitUrl: member.portraitUrl,
      previousFaceIds: Array.isArray(row?.rekognition_face_ids) ? row!.rekognition_face_ids! : [],
    });
    if (!res.ok) {
      problems.push(`${member.characterId}:${res.reason ?? "index_failed"}`);
      return;
    }
    indexed++;
    await supabase
      .from("brand_characters")
      .update({
        rekognition_face_ids: res.faceIds,
        rekognition_collection_id: collectionId,
        rekognition_portrait_hash: res.portraitHash,
        rekognition_indexed_at: new Date().toISOString(),
      })
      .eq("id", member.characterId);
  }));

  return { indexed, problems };
}

export async function resolveCastIdentityLock(params: {
  // deno-lint-ignore no-explicit-any
  supabase: any;
  userId: string;
  cast: CastMember[];
  frameUrl: string;
  frameWidth: number;
  frameHeight: number;
}): Promise<CastIdentityLockResult> {
  const t0 = Date.now();
  const base: CastIdentityLockResult = {
    verdict: "unavailable",
    method: CAST_IDENTITY_LOCK_TAG,
    assignmentLock: {},
    facesBySpeaker: {},
    faces: [],
    duplicateCharacterIds: [],
    missingCharacterIds: [],
    indexedCount: 0,
    detectedCount: 0,
    resolvedCount: 0,
    msTotal: 0,
  };

  if (!faceCollectionAvailable()) {
    return { ...base, reason: "aws_credentials_missing", msTotal: Date.now() - t0 };
  }
  if (!params.userId || !params.frameUrl || params.cast.length === 0) {
    return { ...base, reason: "empty_input", msTotal: Date.now() - t0 };
  }

  const collectionId = collectionIdForUser(params.userId);
  if (!(await ensureCollection(collectionId))) {
    return { ...base, reason: "collection_unavailable", msTotal: Date.now() - t0 };
  }

  const sync = await syncPortraits({ supabase: params.supabase, collectionId, cast: params.cast });
  if (sync.indexed < params.cast.length) {
    // Not every character has a usable biometric → we cannot guarantee a
    // bijection, so we stay out of the way instead of half-assigning.
    return {
      ...base,
      indexedCount: sync.indexed,
      reason: `portraits_not_indexed:${sync.problems.slice(0, 4).join(",")}`,
      msTotal: Date.now() - t0,
    };
  }

  const ident = await identifyFacesInFrame({
    collectionId,
    imageUrl: params.frameUrl,
    frameWidth: params.frameWidth,
    frameHeight: params.frameHeight,
    knownCharacterIds: params.cast.map((c) => c.characterId),
    maxFaces: Math.max(params.cast.length + 2, 4),
  });

  if (!ident.ok) {
    return {
      ...base,
      indexedCount: sync.indexed,
      reason: ident.reason ?? "identify_failed",
      msTotal: Date.now() - t0,
    };
  }

  // ── v361 KOORDINATENVERTRAG ──────────────────────────────────────────
  // `identifyFacesInFrame` liefert Boxen im Raum des GESENDETEN Bildes
  // (`ident.sourceDims`). Der Aufrufer will sie im Zielraum
  // (`frameWidth`/`frameHeight`, i.d.R. die Plate). Bis v360 wurde diese
  // Projektion stillschweigend übersprungen — die Boxen landeten dadurch
  // verschoben auf der Plate und die Preclips zeigten Möbel statt Gesichter.
  const targetDims = {
    width: Math.max(1, Math.round(params.frameWidth)),
    height: Math.max(1, Math.round(params.frameHeight)),
  };
  const sourceDims = ident.sourceDims;
  const needsProjection =
    sourceDims.width !== targetDims.width || sourceDims.height !== targetDims.height;
  const aspect = compareAspect(sourceDims, targetDims);
  if (needsProjection) {
    console.log(
      `[cast-identity-lock] v361_project source=${sourceDims.width}x${sourceDims.height} ` +
      `target=${targetDims.width}x${targetDims.height} aspect_match=${aspect.aspectMatch} ` +
      `dims_source=${ident.dimsSource}`,
    );
  }
  const projectFace = (f: IdentifiedFace): IdentifiedFace =>
    needsProjection
      ? { ...f, bbox: projectNormBox(f.normBbox, sourceDims, targetDims).pixels }
      : f;

  const projectedFaces = ident.faces.map(projectFace);

  const assignmentLock: Record<string, string> = {};
  const facesBySpeaker: Record<string, IdentifiedFace> = {};
  const missing: string[] = [];
  for (const member of params.cast) {
    const raw = ident.byCharacter[member.characterId];
    if (!raw) { missing.push(member.characterId); continue; }
    const face = projectedFaces.find((f) => f.characterId === member.characterId) ?? projectFace(raw);
    assignmentLock[String(member.speakerIdx)] = member.characterId;
    facesBySpeaker[String(member.speakerIdx)] = face;
  }

  const verdict: CastIdentityVerdict =
    ident.duplicateCharacterIds.length > 0
      ? "duplicate"
      : missing.length > 0
        ? "missing"
        : "ok";

  return {
    verdict,
    method: CAST_IDENTITY_LOCK_TAG,
    assignmentLock,
    facesBySpeaker,
    faces: projectedFaces,
    duplicateCharacterIds: ident.duplicateCharacterIds,
    missingCharacterIds: missing,
    indexedCount: sync.indexed,
    detectedCount: ident.detectedCount,
    resolvedCount: Object.keys(assignmentLock).length,
    msTotal: Date.now() - t0,
  };
}
