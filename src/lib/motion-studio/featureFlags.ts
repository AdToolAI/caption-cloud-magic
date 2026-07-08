// v211 — Motion Studio / AI Video Studio Cast & World ID-Integration flags.
//
// These read Vite env vars but always have a safe client-side default so a
// missing `.env` entry never breaks the app. Server-side flags of the same name
// exist for the edge functions; the client mirrors them so the UI can react
// (blocked render buttons, missing-UUID warnings, etc.).

function readFlag(key: string, fallback: boolean): boolean {
  try {
    const raw = (import.meta as any)?.env?.[key];
    if (raw === undefined || raw === null || raw === '') return fallback;
    return String(raw).toLowerCase() === 'true' || raw === '1';
  } catch {
    return fallback;
  }
}

/** When true, `resolveSceneCharacterAnchor` drops the legacy name/brand
 *  fuzzy-match sources; only explicit shots + cast slots with real UUIDs
 *  produce anchors. Default: true (v211 hard-off). */
export const MOTION_STUDIO_STRICT_IDS = readFlag(
  'VITE_MOTION_STUDIO_STRICT_IDS',
  true,
);

/** Server-side flag mirror — when true, the render dispatcher refuses to
 *  submit clips whose scenes lack `scene_assets` UUID persistence. */
export const SCENE_ASSETS_REQUIRED = readFlag(
  'VITE_COMPOSER_SCENE_ASSETS_REQUIRED',
  false,
);

/** Server-side flag mirror — informational only on the client. */
export const FACE_TRACK_PRECLIP = readFlag(
  'VITE_COMPOSER_FACE_TRACK_PRECLIP',
  false,
);
