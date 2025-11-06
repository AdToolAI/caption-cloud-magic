-- ============================================
-- PHASE 1 Part 2: Fix remaining search_path warning
-- ============================================

-- Fix the last function missing search_path
ALTER FUNCTION public.update_affiliates_updated_at() SET search_path = public;