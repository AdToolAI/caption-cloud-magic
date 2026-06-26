// Single source of truth for Smoke-Matrix categories in the Cockpit UI.
// Mirrors `SMOKE_CATEGORIES` from `supabase/functions/_shared/smokeRegistry.ts`.
// Keep in sync when the Deno-side registry changes.

export interface SmokeCategory {
  id: string;
  label: string;
}

export const SMOKE_CATEGORIES: SmokeCategory[] = [
  { id: "ai-video-providers", label: "AI Video (Legacy)" },
  { id: "lipsync-dialog", label: "Lipsync & Dialog" },
  { id: "composer-render", label: "Composer & Render" },
  { id: "briefing-director", label: "Briefing & Director" },
  { id: "briefing-composer", label: "Briefing & Composer (Legacy)" },
  { id: "image-providers", label: "Image / Picture" },
  { id: "picture-image-1", label: "Picture / Image (1)" },
  { id: "picture-image-2", label: "Picture / Image (2)" },
  { id: "audio-music-sfx-1", label: "Audio / Music / SFX (1)" },
  { id: "audio-music-sfx-2", label: "Audio / Music / SFX (2)" },
  { id: "social-meta", label: "Social — Meta" },
  { id: "social-tiktok-twitch", label: "Social — TikTok/Twitch" },
  { id: "social-google", label: "Social — YouTube/Google" },
  { id: "social-other", label: "Social — Other" },
  { id: "social-publishing", label: "Social Publishing (Legacy)" },
  { id: "calendar-planning", label: "Calendar & Planning" },
  { id: "planner-strategy", label: "Planner & Strategy" },
  { id: "ai-text-generation", label: "AI Text Generation" },
  { id: "automation-jobs-1", label: "Automation & Jobs (1)" },
  { id: "automation-jobs-2", label: "Automation & Jobs (2)" },
  { id: "notifications-email", label: "Notifications & Email" },
  { id: "community-coach", label: "Community & Coach" },
  { id: "qa-testing", label: "QA & Testing" },
  { id: "utilities", label: "Utilities & Auth" },
  { id: "data-fetch", label: "Data Fetch & Lookups" },
  { id: "billing-credits", label: "Billing / Credits" },
  { id: "admin-cron-1", label: "Admin / Cron / Health (1)" },
  { id: "admin-cron-2", label: "Admin / Cron / Health (2)" },
  { id: "analytics-reports", label: "Analytics / Reports" },
  { id: "misc-1", label: "Misc (1)" },
  { id: "misc-2", label: "Misc (2)" },
  { id: "misc-3", label: "Misc (3)" },
];

export const SMOKE_CATEGORY_LABELS: Record<string, string> = Object.fromEntries(
  SMOKE_CATEGORIES.map((c) => [c.id, c.label]),
);
