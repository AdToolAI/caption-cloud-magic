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

  // ────────────── Wave B2.1 — Video / Image Providers (mock-guarded) ──────────────
  { name: "generate-ai-video",                category: "ai-video-providers", body: { prompt: "qa", duration: 5 }, expect: "any-2xx" },
  { name: "generate-fast-preview",            category: "ai-video-providers", body: { prompt: "qa" }, expect: "any-2xx" },
  { name: "generate-video-variants",          category: "ai-video-providers", body: { prompt: "qa" }, expect: "any-2xx" },
  { name: "generate-composer-image-scene",    category: "picture-image", body: { prompt: "qa" }, expect: "any-2xx" },
  { name: "generate-scene-visual",            category: "picture-image", body: { prompt: "qa" }, expect: "any-2xx" },
  { name: "generate-scene-still",             category: "picture-image", body: { prompt: "qa" }, expect: "any-2xx" },
  { name: "generate-background-scenes",       category: "picture-image", body: { prompt: "qa" }, expect: "any-2xx" },
  { name: "generate-video-thumbnail",         category: "picture-image", body: { prompt: "qa" }, expect: "any-2xx" },
  { name: "generate-thumbnail",               category: "picture-image", body: { prompt: "qa" }, expect: "any-2xx" },
  { name: "generate-premium-visual",          category: "picture-image", body: { prompt: "qa" }, expect: "any-2xx" },
  { name: "generate-studio-image",            category: "picture-image", body: { prompt: "qa" }, expect: "any-2xx" },
  { name: "generate-brand-asset",             category: "picture-image", body: { prompt: "qa", kind: "logo" }, expect: "any-2xx" },
  { name: "generate-character-sheet",         category: "picture-image", body: { prompt: "qa" }, expect: "any-2xx" },
  { name: "generate-avatar-portrait",         category: "picture-image", body: { prompt: "qa" }, expect: "any-2xx" },
  { name: "generate-avatar-poses",            category: "picture-image", body: { avatarId: "qa-mock" }, expect: "any-2xx" },
  { name: "generate-avatar-wardrobe",         category: "picture-image", body: { avatarId: "qa-mock" }, expect: "any-2xx" },
  { name: "generate-wardrobe-perspectives",   category: "picture-image", body: { avatarId: "qa-mock" }, expect: "any-2xx" },
  { name: "generate-location-vibes",          category: "picture-image", body: { locationId: "qa-mock" }, expect: "any-2xx" },
  { name: "generate-location-props",          category: "picture-image", body: { locationId: "qa-mock" }, expect: "any-2xx" },
  { name: "generate-world-asset",             category: "picture-image", body: { prompt: "qa", kind: "prop" }, expect: "any-2xx" },
  { name: "generate-image-prompt",            category: "briefing-composer", body: { userText: "qa" }, expect: "any-2xx" },
  // ────────────── Wave B2.2-B2.6 — Audio / Music / Composer / Social / Analytics / Autopilot ──────────────
  { name: "clone-voice", category: "audio-music-sfx", body: { name: "qa", audioUrl: MOCK_AUDIO }, expect: "any-2xx" },
  { name: "compose-twoshot-audio", category: "audio-music-sfx", body: { sceneId: MOCK_UUID }, expect: "any-2xx" },
  { name: "director-cut-audio-mixing", category: "audio-music-sfx", body: { projectId: MOCK_UUID }, expect: "any-2xx" },
  { name: "director-cut-voice-over", category: "audio-music-sfx", body: { projectId: MOCK_UUID, text: "qa" }, expect: "any-2xx" },
  { name: "generate-multi-speaker-vo", category: "audio-music-sfx", body: { sceneId: MOCK_UUID, lines: [] }, expect: "any-2xx" },
  { name: "generate-video-voiceover", category: "audio-music-sfx", body: { text: "qa", voiceId: "qa" }, expect: "any-2xx" },
  { name: "generate-voiceover", category: "audio-music-sfx", body: { text: "qa", voiceId: "qa" }, expect: "any-2xx" },
  { name: "generate-voiceover-hume", category: "audio-music-sfx", body: { text: "qa", voiceId: "qa" }, expect: "any-2xx" },
  { name: "generate-voiceover-script", category: "audio-music-sfx", body: { topic: "qa", duration: 15 }, expect: "any-2xx" },
  { name: "list-voices", category: "audio-music-sfx", body: {}, expect: "any-2xx" },
  { name: "list-voices-hume", category: "audio-music-sfx", body: {}, expect: "any-2xx" },
  { name: "preview-voice", category: "audio-music-sfx", body: { voiceId: "qa", text: "hi" }, expect: "any-2xx" },
  { name: "preview-voice-hume", category: "audio-music-sfx", body: { voiceId: "qa", text: "hi" }, expect: "any-2xx" },
  { name: "transcribe-audio", category: "audio-music-sfx", body: { audioUrl: MOCK_AUDIO }, expect: "any-2xx" },
  { name: "translate-and-voiceover", category: "audio-music-sfx", body: { text: "qa", targetLang: "de" }, expect: "any-2xx" },
  { name: "separate-audio-stems", category: "audio-music-sfx", body: { audioUrl: MOCK_AUDIO }, expect: "any-2xx" },
  { name: "audio-studio-enhance", category: "audio-music-sfx", body: { audioUrl: MOCK_AUDIO }, expect: "any-2xx" },
  { name: "mux-audio-to-video", category: "audio-music-sfx", body: { videoUrl: "https://example.com/v.mp4", audioUrl: MOCK_AUDIO }, expect: "any-2xx" },
  { name: "render-sync-segments-audio-mux", category: "audio-music-sfx", body: { projectId: MOCK_UUID }, expect: "any-2xx" },
  { name: "proxy-audio", category: "audio-music-sfx", body: { url: MOCK_AUDIO }, expect: "any-2xx" },
  { name: "companion-transcribe", category: "audio-music-sfx", body: { audioUrl: MOCK_AUDIO }, expect: "any-2xx" },
  { name: "analyze-brand-voice", category: "audio-music-sfx", body: { audioUrl: MOCK_AUDIO }, expect: "any-2xx" },
  { name: "audio-beat-detection", category: "audio-music-sfx", body: { audioUrl: MOCK_AUDIO }, expect: "any-2xx" },
  { name: "analyze-music-beats", category: "audio-music-sfx", body: { audioUrl: MOCK_AUDIO }, expect: "any-2xx" },
  { name: "analyze-music-bpm", category: "audio-music-sfx", body: { audioUrl: MOCK_AUDIO }, expect: "any-2xx" },
  { name: "auto-match-music-to-video", category: "audio-music-sfx", body: { videoUrl: "https://example.com/v.mp4" }, expect: "any-2xx" },
  { name: "director-cut-sound-design", category: "audio-music-sfx", body: { projectId: MOCK_UUID }, expect: "any-2xx" },
  { name: "generate-music-lyrics", category: "audio-music-sfx", body: { topic: "qa", duration: 30 }, expect: "any-2xx" },
  { name: "search-stock-sfx", category: "audio-music-sfx", body: { query: "boom", page: 1, perPage: 4 }, expect: "any-2xx" },
  { name: "seed-background-music", category: "audio-music-sfx", body: {}, expect: "any-2xx" },
  { name: "suggest-video-music", category: "audio-music-sfx", body: { videoTopic: "qa" }, expect: "any-2xx" },
  { name: "upload-music-to-storage", category: "audio-music-sfx", body: { audioUrl: MOCK_AUDIO, title: "qa" }, expect: "any-2xx" },
  { name: "validate-music-track", category: "audio-music-sfx", body: { audioUrl: MOCK_AUDIO }, expect: "any-2xx" },
  { name: "compose-clip-webhook", category: "briefing-composer", body: { predictionId: "qa-mock" }, expect: "any-2xx" },
  { name: "compose-dialog-scene", category: "briefing-composer", body: { sceneId: MOCK_UUID }, expect: "any-2xx" },
  { name: "compose-dialog-segments", category: "briefing-composer", body: { sceneId: MOCK_UUID }, expect: "any-2xx" },
  { name: "compose-scene-variants", category: "briefing-composer", body: { sceneId: MOCK_UUID }, expect: "any-2xx" },
  { name: "compose-stitch-and-handoff", category: "briefing-composer", body: { projectId: MOCK_UUID }, expect: "any-2xx" },
  { name: "compose-video-assemble", category: "briefing-composer", body: { projectId: MOCK_UUID }, expect: "any-2xx" },
  { name: "compose-video-clips", category: "briefing-composer", body: { sceneId: MOCK_UUID }, expect: "any-2xx" },
  { name: "compose-video-storyboard", category: "briefing-composer", body: { briefing: "qa" }, expect: "any-2xx" },
  { name: "hybrid-extend-scene", category: "briefing-composer", body: { sceneId: MOCK_UUID }, expect: "any-2xx" },
  { name: "reset-lipsync-scene", category: "briefing-composer", body: { sceneId: MOCK_UUID }, expect: "any-2xx" },
  { name: "scene-director", category: "briefing-composer", body: { description: "qa", durationSec: 5 }, expect: "any-2xx" },
  { name: "analyze-brand-consistency", category: "picture-image", body: { imageUrl: MOCK_IMAGE }, expect: "any-2xx" },
  { name: "clone-preset-avatar", category: "picture-image", body: { presetId: "qa-mock" }, expect: "any-2xx" },
  { name: "generate-brand-kit", category: "picture-image", body: { brandName: "qa" }, expect: "any-2xx" },
  { name: "repair-brand-character-urls", category: "picture-image", body: { dryRun: true }, expect: "any-2xx" },
  { name: "seed-preset-avatars", category: "picture-image", body: { dryRun: true }, expect: "any-2xx" },
  { name: "briefing-deep-parse", category: "briefing-composer", body: { briefingText: "qa", language: "en" }, expect: "any-2xx" },
  { name: "analyze-script", category: "briefing-composer", body: { script: "qa" }, expect: "any-2xx" },
  { name: "analyze-script-for-video", category: "briefing-composer", body: { script: "qa" }, expect: "any-2xx" },
  { name: "analyze-style-reference", category: "briefing-composer", body: { imageUrl: MOCK_IMAGE }, expect: "any-2xx" },
  { name: "analyze-scene-subject", category: "briefing-composer", body: { imageUrl: MOCK_IMAGE }, expect: "any-2xx" },
  { name: "analyze-trend", category: "analytics-reports", body: { trend: "qa" }, expect: "any-2xx" },
  { name: "analyze-video-scenes", category: "briefing-composer", body: { videoUrl: "https://example.com/v.mp4" }, expect: "any-2xx" },
  { name: "analyze-image-caption", category: "picture-image", body: { imageUrl: MOCK_IMAGE }, expect: "any-2xx" },
  { name: "analyze-hashtags", category: "analytics-reports", body: { text: "qa" }, expect: "any-2xx" },
  { name: "analyze-post-optimization", category: "analytics-reports", body: { postText: "qa" }, expect: "any-2xx" },
  { name: "analyze-performance", category: "analytics-reports", body: { range: "7d" }, expect: "any-2xx" },
  { name: "analyze-performance-strategy", category: "analytics-reports", body: { range: "7d" }, expect: "any-2xx" },
  { name: "analyze-posting-times", category: "analytics-reports", body: { platform: "tiktok" }, expect: "any-2xx" },
  { name: "publish-post", category: "social-publishing", body: { platform: "tiktok", postText: "qa" }, expect: "any-2xx" },
  { name: "publish-to-instagram", category: "social-publishing", body: { caption: "qa" }, expect: "any-2xx" },
  { name: "publish-to-linkedin", category: "social-publishing", body: { text: "qa" }, expect: "any-2xx" },
  { name: "publish-to-tiktok", category: "social-publishing", body: { caption: "qa", videoUrl: "https://example.com/v.mp4" }, expect: "any-2xx" },
  { name: "publish-to-youtube", category: "social-publishing", body: { title: "qa", videoUrl: "https://example.com/v.mp4" }, expect: "any-2xx" },
  { name: "schedule-post-with-ab", category: "social-publishing", body: { postId: "qa-mock" }, expect: "any-2xx" },
  { name: "social-health", category: "social-publishing", body: {}, expect: "any-2xx" },
  { name: "instagram-graph-sync", category: "social-publishing", body: {}, expect: "any-2xx" },
  { name: "instagram-publish", category: "social-publishing", body: { caption: "qa" }, expect: "any-2xx" },
  { name: "instagram-token-test", category: "social-publishing", body: {}, expect: "any-2xx" },
  { name: "linkedin-metrics", category: "social-publishing", body: {}, expect: "any-2xx" },
  { name: "linkedin-post", category: "social-publishing", body: { text: "qa" }, expect: "any-2xx" },
  { name: "tiktok-health", category: "social-publishing", body: {}, expect: "any-2xx" },
  { name: "tiktok-sync", category: "social-publishing", body: {}, expect: "any-2xx" },
  { name: "tiktok-upload", category: "social-publishing", body: { videoUrl: "https://example.com/v.mp4" }, expect: "any-2xx" },
  { name: "x-publish", category: "social-publishing", body: { text: "qa" }, expect: "any-2xx" },
  { name: "x-refresh", category: "social-publishing", body: {}, expect: "any-2xx" },
  { name: "x-refresh-token", category: "social-publishing", body: {}, expect: "any-2xx" },
  { name: "youtube-live", category: "social-publishing", body: {}, expect: "any-2xx" },
  { name: "analyze-ad-campaign-performance", category: "analytics-reports", body: { campaignId: "qa-mock" }, expect: "any-2xx" },
  { name: "analyze-comments", category: "analytics-reports", body: { postId: "qa-mock" }, expect: "any-2xx" },
  { name: "analyze-goal-progress", category: "analytics-reports", body: {}, expect: "any-2xx" },
  { name: "apply-optimization", category: "analytics-reports", body: { optimizationId: "qa-mock" }, expect: "any-2xx" },
  { name: "admin-cost-snapshot", category: "analytics-reports", body: {}, expect: "any-2xx" },
  { name: "admin-stats", category: "analytics-reports", body: {}, expect: "any-2xx" },
  { name: "autopilot-daily-digest", category: "admin-cron", body: { dryRun: true }, expect: "any-2xx" },
  { name: "autopilot-generate-slot", category: "admin-cron", body: { slotId: "qa-mock" }, expect: "any-2xx" },
  { name: "autopilot-performance-analyze", category: "admin-cron", body: { dryRun: true }, expect: "any-2xx" },
  { name: "autopilot-plan-week", category: "admin-cron", body: { dryRun: true }, expect: "any-2xx" },
  { name: "autopilot-prompt-shield", category: "admin-cron", body: { prompt: "qa" }, expect: "any-2xx" },
  { name: "autopilot-publish-due", category: "admin-cron", body: { dryRun: true }, expect: "any-2xx" },
  { name: "autopilot-qa-gate", category: "admin-cron", body: { slotId: "qa-mock" }, expect: "any-2xx" },
  { name: "autopilot-safety-check", category: "admin-cron", body: { prompt: "qa" }, expect: "any-2xx" },
  { name: "autopilot-toggle", category: "admin-cron", body: { enabled: true }, expect: "any-2xx" },
  { name: "autopilot-video-poll", category: "admin-cron", body: { dryRun: true }, expect: "any-2xx" },
  { name: "autopilot-weekly-review", category: "admin-cron", body: { dryRun: true }, expect: "any-2xx" },
  { name: "autopilot-emit-notification", category: "admin-cron", body: { event: "qa" }, expect: "any-2xx" },
  { name: "cache-cleanup", category: "admin-cron", body: { dryRun: true }, expect: "any-2xx" },
  { name: "cache-invalidator", category: "admin-cron", body: { key: "qa" }, expect: "any-2xx" },
  { name: "ai-queue-worker", category: "admin-cron", body: { dryRun: true }, expect: "any-2xx" },
  { name: "ai-companion", category: "misc", body: { message: "qa" }, expect: "any-2xx" },
  { name: "batch-create-videos", category: "misc", body: { briefs: [] }, expect: "any-2xx" },
  { name: "auto-generate-universal-video", category: "misc", body: { topic: "qa" }, expect: "any-2xx" },
  { name: "auto-director-compose", category: "misc", body: { briefing: "qa" }, expect: "any-2xx" },
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
