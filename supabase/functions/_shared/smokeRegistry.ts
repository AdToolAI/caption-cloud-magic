// Function Smoke Matrix — Registry of safely-sweepable edge functions.
//
// Each entry describes how to call ONE edge function with a deterministic
// mock payload so the Bond-QA Function Matrix can verify it returns 200 +
// the expected shape. NEVER add functions that mutate user data without
// a working `x-qa-mock` short-circuit.
//
// Categories drive grouping in the Cockpit UI.

export type SmokeStatusExpect = "any-2xx" | "ok-flag" | "structured";

export interface SmokeEntry {
  /** Edge function name (folder name under supabase/functions/). */
  name: string;
  category:
    | "ai-video-providers"
    | "lipsync-dialog"
    | "briefing-composer"
    | "picture-image"
    | "audio-music-sfx"
    | "social-publishing"
    | "billing-credits"
    | "admin-cron"
    | "analytics-reports"
    | "misc";
  /** Body sent in the test request. */
  body?: Record<string, unknown>;
  /** Extra headers (x-qa-mock is added automatically). */
  headers?: Record<string, string>;
  /** Loose expectation: status code OR JSON field presence. */
  expect?: SmokeStatusExpect;
  /** If true, function is skipped automatically with the given reason. */
  skip?: string;
  /** Soft per-call timeout in ms. Default 8000. */
  timeoutMs?: number;
}

// Helper UUIDs for mock payloads (never written to DB in mock mode).
const MOCK_UUID = "00000000-0000-0000-0000-000000000001";
const MOCK_IMAGE = "https://storage.googleapis.com/lovable-public/qa-mock/sample-1024.jpg";
const MOCK_AUDIO = "https://storage.googleapis.com/lovable-public/qa-mock/sample-5s.mp3";

export const SMOKE_REGISTRY: SmokeEntry[] = [
  // ────────────── AI Video Providers (x-qa-mock fully supported) ──────────────
  {
    name: "generate-hailuo-video",
    category: "ai-video-providers",
    body: { prompt: "a cat walking", duration: 6, resolution: "768p" },
    expect: "ok-flag",
  },
  {
    name: "generate-kling-video",
    category: "ai-video-providers",
    body: { prompt: "a cat walking", duration: 5 },
    expect: "ok-flag",
  },
  {
    name: "generate-luma-video",
    category: "ai-video-providers",
    body: { prompt: "a cat walking", duration: 5 },
    expect: "ok-flag",
  },
  {
    name: "generate-veo-video",
    category: "ai-video-providers",
    body: { prompt: "a cat walking", duration: 5 },
    expect: "ok-flag",
  },
  {
    name: "generate-seedance-video",
    category: "ai-video-providers",
    body: { prompt: "a cat walking", duration: 5 },
    expect: "ok-flag",
  },
  {
    name: "generate-wan-video",
    category: "ai-video-providers",
    body: { prompt: "a cat walking", duration: 5 },
    expect: "ok-flag",
  },
  {
    name: "generate-vidu-video",
    category: "ai-video-providers",
    body: { prompt: "a cat walking", duration: 5 },
    expect: "ok-flag",
  },
  {
    name: "generate-pika-video",
    category: "ai-video-providers",
    body: { prompt: "a cat walking", duration: 5 },
    expect: "ok-flag",
  },
  {
    name: "generate-happyhorse-video",
    category: "ai-video-providers",
    body: { prompt: "a cat walking", duration: 5, resolution: "720p" },
    expect: "ok-flag",
  },
  {
    name: "generate-grok-video",
    category: "ai-video-providers",
    body: { prompt: "a cat walking", duration: 5 },
    expect: "ok-flag",
  },
  {
    name: "generate-ltx-video",
    category: "ai-video-providers",
    body: { prompt: "a cat walking", duration: 5 },
    expect: "ok-flag",
  },
  {
    name: "generate-runway-video",
    category: "ai-video-providers",
    body: { prompt: "a cat walking", duration: 5 },
    expect: "ok-flag",
  },

  // ────────────── Lipsync / Dialog (mocked) ──────────────
  {
    name: "lip-sync-video",
    category: "lipsync-dialog",
    body: { videoUrl: "https://example.com/v.mp4", audioUrl: MOCK_AUDIO },
    expect: "ok-flag",
  },
  {
    name: "animate-scene-hailuo",
    category: "lipsync-dialog",
    body: { sceneId: MOCK_UUID, prompt: "test" },
    expect: "ok-flag",
  },
  {
    name: "compose-scene-anchor",
    category: "lipsync-dialog",
    body: { sceneId: MOCK_UUID, portraitUrls: [MOCK_IMAGE] },
    expect: "ok-flag",
  },

  // ────────────── Picture / Image (mocked) ──────────────
  {
    name: "generate-image-replicate",
    category: "picture-image",
    body: { prompt: "a cat", model: "flux-schnell" },
    expect: "ok-flag",
  },
  {
    name: "analyze-image-v2",
    category: "picture-image",
    body: { imageUrl: MOCK_IMAGE },
    expect: "any-2xx",
  },
  {
    name: "analyze-logo",
    category: "picture-image",
    body: { imageUrl: MOCK_IMAGE },
    expect: "any-2xx",
  },

  // ────────────── Audio / Music / SFX (mocked) ──────────────
  {
    name: "generate-music-track",
    category: "audio-music-sfx",
    body: { prompt: "lofi beat", duration: 5 },
    expect: "ok-flag",
  },
  {
    name: "generate-scene-sfx",
    category: "audio-music-sfx",
    body: { prompt: "door slam", duration: 2 },
    expect: "ok-flag",
  },
  {
    name: "generate-talking-head",
    category: "audio-music-sfx",
    body: { portraitUrl: MOCK_IMAGE, audioUrl: MOCK_AUDIO },
    expect: "ok-flag",
  },

  // ────────────── Read-only / Analytics / Health (no mock header needed) ──────────────
  {
    name: "public-status",
    category: "admin-cron",
    body: {},
    expect: "any-2xx",
  },
  {
    name: "qa-watchdog",
    category: "admin-cron",
    body: { dryRun: true },
    expect: "any-2xx",
  },
  {
    name: "synthetic-probe",
    category: "admin-cron",
    body: { dryRun: true },
    expect: "any-2xx",
  },
  {
    name: "auto-refresh-meta-tokens",
    category: "admin-cron",
    body: { mode: "status" },
    expect: "any-2xx",
  },

  // ────────────── Stock / Library searches (cache-backed, cheap) ──────────────
  {
    name: "search-stock-videos",
    category: "misc",
    body: { query: "ocean", page: 1, perPage: 4 },
    expect: "any-2xx",
  },
  {
    name: "search-stock-music",
    category: "audio-music-sfx",
    body: { query: "lofi", page: 1, perPage: 4 },
    expect: "any-2xx",
  },
  {
    name: "search-sfx-library",
    category: "audio-music-sfx",
    body: { query: "whoosh", page: 1, perPage: 4 },
    expect: "any-2xx",
  },

  // ────────────── Briefing / Composer (LLM, mocked via header) ──────────────
  {
    name: "extract-subtitle-keywords",
    category: "briefing-composer",
    body: { subtitles: [{ id: "1", text: "this is a test line" }], language: "en" },
    expect: "any-2xx",
  },

  // ────────────── Wave B1 — Trivial Mocks (Health / Check / Get / Fetch) ──────────────
  // Admin / Cron / Health
  { name: "check-calendar-deadlines",     category: "admin-cron", body: {}, expect: "any-2xx" },
  { name: "check-content-video-status",   category: "admin-cron", body: { videoId: "qa-mock" }, expect: "any-2xx" },
  { name: "check-remotion-progress",      category: "admin-cron", body: { renderId: "qa-mock" }, expect: "any-2xx" },
  { name: "check-render-cache",           category: "admin-cron", body: { cacheKey: "qa-mock" }, expect: "any-2xx" },
  { name: "check-render-status",          category: "admin-cron", body: { renderId: "qa-mock" }, expect: "any-2xx" },
  { name: "check-scheduled-publications", category: "admin-cron", body: {}, expect: "any-2xx" },
  { name: "check-streak-breaks",          category: "admin-cron", body: {}, expect: "any-2xx" },
  { name: "check-subscription",           category: "billing-credits", body: {}, expect: "any-2xx" },
  { name: "check-trial-status",           category: "admin-cron", body: {}, expect: "any-2xx" },
  { name: "check-video-status",           category: "admin-cron", body: { videoId: "qa-mock" }, expect: "any-2xx" },
  { name: "health-alerter",               category: "admin-cron", body: {}, expect: "any-2xx" },
  { name: "health-check",                 category: "admin-cron", body: {}, expect: "any-2xx" },
  { name: "health-ig",                    category: "admin-cron", body: {}, expect: "any-2xx" },
  { name: "health-li",                    category: "admin-cron", body: {}, expect: "any-2xx" },
  { name: "health-tt",                    category: "admin-cron", body: {}, expect: "any-2xx" },
  { name: "health-x",                     category: "admin-cron", body: {}, expect: "any-2xx" },
  { name: "health-yt",                    category: "admin-cron", body: {}, expect: "any-2xx" },
  // Get / Fetch (read-only lookups)
  { name: "get-ab-test-results",          category: "analytics-reports", body: {}, expect: "any-2xx" },
  { name: "get-comments",                 category: "social-publishing", body: { postId: "qa-mock" }, expect: "any-2xx" },
  { name: "get-invoices",                 category: "billing-credits", body: {}, expect: "any-2xx" },
  { name: "get-video-templates",          category: "misc", body: {}, expect: "any-2xx" },
  { name: "fetch-analytics",              category: "analytics-reports", body: {}, expect: "any-2xx" },
  { name: "fetch-news-hub",               category: "misc", body: { language: "en" }, expect: "any-2xx" },
  { name: "fetch-news-radar",             category: "misc", body: { language: "en" }, expect: "any-2xx" },
  { name: "fetch-trends",                 category: "misc", body: { language: "en" }, expect: "any-2xx" },
];

/** Categories in display order for the Cockpit UI. */
export const SMOKE_CATEGORIES: Array<{ id: SmokeEntry["category"]; label: string }> = [
  { id: "ai-video-providers", label: "AI Video Providers" },
  { id: "lipsync-dialog", label: "Lipsync & Dialog" },
  { id: "briefing-composer", label: "Briefing & Composer" },
  { id: "picture-image", label: "Picture / Image" },
  { id: "audio-music-sfx", label: "Audio / Music / SFX" },
  { id: "social-publishing", label: "Social Publishing" },
  { id: "billing-credits", label: "Billing / Credits" },
  { id: "admin-cron", label: "Admin / Cron / Health" },
  { id: "analytics-reports", label: "Analytics / Reports" },
  { id: "misc", label: "Misc" },
];
