-- ============================================
-- PHASE 1: Security Hardening - Fix RLS Policies and Security Definer Issues
-- ============================================

-- ============================================
-- Part 1: Add missing RLS Policies for app_secrets
-- ============================================
-- app_secrets should only be accessible by service role, not by users
-- This table stores sensitive API keys and secrets

CREATE POLICY "Service role can manage app_secrets"
ON public.app_secrets
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- ============================================
-- Part 2: Add missing RLS Policies for kv_secrets_backup
-- ============================================
-- kv_secrets_backup should only be accessible by service role
-- This is a backup table for encrypted secrets

CREATE POLICY "Service role can manage kv_secrets_backup"
ON public.kv_secrets_backup
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- ============================================
-- Part 3: Fix Function Search Paths (Security Warning)
-- ============================================
-- Add search_path to functions that are missing it to prevent SQL injection

-- Cleanup functions (called by cron, need search_path)
ALTER FUNCTION public.cleanup_expired_oauth_states() SET search_path = public;
ALTER FUNCTION public.cleanup_old_active_publishes() SET search_path = public;
ALTER FUNCTION public.cleanup_old_ai_jobs() SET search_path = public;
ALTER FUNCTION public.cleanup_old_rate_limit_states() SET search_path = public;
ALTER FUNCTION public.cleanup_old_rate_limits() SET search_path = public;
ALTER FUNCTION public.cleanup_stale_active_jobs() SET search_path = public;

-- Trigger functions (need search_path)
ALTER FUNCTION public.compute_engagement_rate() SET search_path = public;
ALTER FUNCTION public.create_default_workspace() SET search_path = public;
ALTER FUNCTION public.create_user_storage() SET search_path = public;
ALTER FUNCTION public.create_wallet_for_new_user() SET search_path = public;
ALTER FUNCTION public.enforce_single_user_non_enterprise() SET search_path = public;
ALTER FUNCTION public.ensure_single_active_brand_kit() SET search_path = public;
ALTER FUNCTION public.process_goal_progress_event() SET search_path = public;
ALTER FUNCTION public.reset_monthly_credits() SET search_path = public;
ALTER FUNCTION public.set_content_hash() SET search_path = public;
ALTER FUNCTION public.sync_campaign_to_content_items() SET search_path = public;
ALTER FUNCTION public.sync_email_verified() SET search_path = public;
ALTER FUNCTION public.sync_media_asset_to_content_item() SET search_path = public;
ALTER FUNCTION public.sync_media_library_to_content_items() SET search_path = public;
ALTER FUNCTION public.trigger_status_change_notification() SET search_path = 'public', 'extensions';
ALTER FUNCTION public.update_ai_jobs_updated_at() SET search_path = public;
ALTER FUNCTION public.update_metrics_from_event() SET search_path = public;
ALTER FUNCTION public.update_projects_updated_at() SET search_path = public;
ALTER FUNCTION public.update_storage_quota_on_plan_change() SET search_path = public;
ALTER FUNCTION public.update_updated_at() SET search_path = public;
ALTER FUNCTION public.update_updated_at_column() SET search_path = public;
ALTER FUNCTION public.update_wallet_updated_at() SET search_path = public;
ALTER FUNCTION public.update_workspace_updated_at() SET search_path = public;

-- Helper functions that can be called by users (need search_path)
ALTER FUNCTION public.compute_content_hash(text, text[], text[]) SET search_path = public;
ALTER FUNCTION public.deduct_credits(uuid, integer) SET search_path = public;
ALTER FUNCTION public.increment_balance(uuid, integer) SET search_path = public;
ALTER FUNCTION public.increment_daily_metric(uuid, date, text, integer) SET search_path = public;
ALTER FUNCTION public.increment_usage(uuid, date) SET search_path = public;

-- Note: RLS checker functions (has_role, is_workspace_member, etc.) already have search_path set
-- These MUST remain SECURITY DEFINER as they're used in RLS policies