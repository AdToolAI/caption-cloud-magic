/**
 * Beta launch feature flags.
 *
 * Set `BETA_ACTIVE = true` after the launch phase to expose all
 * half-finished sections (hubs marked `comingSoon`, OAuth providers
 * without a wired flow, etc.) to regular users.
 *
 * While `BETA_ACTIVE = false`, these areas are hidden from non-admins
 * to avoid dead ends during the Beta.
 *
 * Admins always see everything regardless of this flag.
 */
export const BETA_ACTIVE = false;

/**
 * Helper: should a half-finished / coming-soon surface be visible to
 * the current user?
 */
export function showBetaSurface(isAdmin: boolean): boolean {
  return BETA_ACTIVE || isAdmin;
}
