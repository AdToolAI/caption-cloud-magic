/**
 * Single source of truth for the admin recipient that receives all
 * system-generated alert emails (provider quotas, health checks,
 * weekly reports).
 *
 * To rotate the address, change ADMIN_ALERT_EMAIL_DEFAULT below
 * OR set the ADMIN_ALERT_EMAIL secret in the Edge Function env.
 */
const ADMIN_ALERT_EMAIL_DEFAULT = 'bestofproducts4u@gmail.com';

export const ADMIN_ALERT_EMAIL: string =
  Deno.env.get('ADMIN_ALERT_EMAIL')?.trim() || ADMIN_ALERT_EMAIL_DEFAULT;
