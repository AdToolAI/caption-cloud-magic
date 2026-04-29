
-- ============================================
-- BOND QA AGENT — SCHEMA (Session QA-1)
-- ============================================

-- 1) MISSIONS LIBRARY
create table if not exists public.qa_missions (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  tier text not null check (tier in ('smoke','regression','deep','exploration','performance')),
  category text not null default 'workflow',
  steps jsonb not null default '[]'::jsonb,
  expected_assertions jsonb not null default '[]'::jsonb,
  cost_real_providers text[] not null default '{}',
  cost_cap_cents integer not null default 0,
  enabled boolean not null default true,
  rate_limit_minutes integer not null default 240,
  last_run_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2) TEST RUNS
create table if not exists public.qa_test_runs (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid references public.qa_missions(id) on delete set null,
  mission_name text not null,
  tier text not null,
  status text not null default 'pending' check (status in ('pending','running','succeeded','failed','aborted','skipped')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  duration_ms integer,
  steps_total integer default 0,
  steps_completed integer default 0,
  bugs_found integer default 0,
  cost_actual_cents integer not null default 0,
  cost_budgeted_cents integer not null default 0,
  baseline_run_id uuid references public.qa_test_runs(id) on delete set null,
  triggered_by text not null default 'cron',
  log_summary text,
  last_screenshot_url text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_qa_runs_status on public.qa_test_runs(status, started_at desc);
create index if not exists idx_qa_runs_mission on public.qa_test_runs(mission_id, started_at desc);

-- 3) BUG REPORTS
create table if not exists public.qa_bug_reports (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references public.qa_test_runs(id) on delete cascade,
  mission_name text not null,
  severity text not null check (severity in ('critical','high','medium','low','info')),
  category text not null check (category in ('workflow','visual','data-integrity','performance','regression','cost-overrun','console','network','assertion')),
  title text not null,
  description text,
  route text,
  step_index integer,
  reproduce_steps jsonb not null default '[]'::jsonb,
  screenshot_url text,
  console_log jsonb,
  network_trace jsonb,
  diff_from_baseline jsonb,
  status text not null default 'open' check (status in ('open','triaged','in_progress','resolved','wont_fix','duplicate')),
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_qa_bugs_status on public.qa_bug_reports(status, severity, created_at desc);
create index if not exists idx_qa_bugs_run on public.qa_bug_reports(run_id);

-- 4) TEST ASSETS (cached inputs to avoid generation costs)
create table if not exists public.qa_test_assets (
  id uuid primary key default gen_random_uuid(),
  asset_type text not null check (asset_type in ('video','image','audio','script','subtitle','voiceover','music')),
  tags text[] not null default '{}',
  url text not null,
  storage_path text,
  duration_seconds numeric,
  width integer,
  height integer,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_qa_assets_type on public.qa_test_assets(asset_type);

-- 5) BASELINES (for differential testing)
create table if not exists public.qa_baselines (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid references public.qa_missions(id) on delete cascade,
  step_index integer not null,
  step_name text,
  screenshot_hash text,
  screenshot_url text,
  dom_snapshot_hash text,
  performance_lcp_ms numeric,
  performance_cls numeric,
  performance_js_heap_mb numeric,
  captured_at timestamptz not null default now(),
  unique (mission_id, step_index)
);

-- 6) BUDGET LEDGER (hard 300€/month cap enforcement)
create table if not exists public.qa_budget_ledger (
  id uuid primary key default gen_random_uuid(),
  period text not null check (period in ('day','week','month')),
  period_start date not null,
  category text not null check (category in ('ai_video','ai_image','voiceover','music','talking_head','autopilot','translator','exploration','other')),
  budgeted_cents integer not null default 0,
  spent_cents integer not null default 0,
  hard_cap_cents integer not null default 30000,
  updated_at timestamptz not null default now(),
  unique (period, period_start, category)
);

-- 7) PROVIDER ROTATION
create table if not exists public.qa_provider_rotation (
  id uuid primary key default gen_random_uuid(),
  provider text not null unique,
  category text not null,
  last_real_test_at timestamptz,
  next_due_at timestamptz default now(),
  total_tests integer not null default 0,
  total_failures integer not null default 0,
  avg_cost_cents integer not null default 0,
  enabled boolean not null default true
);

-- 8) Add is_test_user flag to profiles
alter table public.profiles add column if not exists is_test_user boolean not null default false;
alter table public.profiles add column if not exists qa_budget_cents integer not null default 0;

-- ============================================
-- RLS — ADMIN ONLY
-- ============================================
alter table public.qa_missions enable row level security;
alter table public.qa_test_runs enable row level security;
alter table public.qa_bug_reports enable row level security;
alter table public.qa_test_assets enable row level security;
alter table public.qa_baselines enable row level security;
alter table public.qa_budget_ledger enable row level security;
alter table public.qa_provider_rotation enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['qa_missions','qa_test_runs','qa_bug_reports','qa_test_assets','qa_baselines','qa_budget_ledger','qa_provider_rotation']
  loop
    execute format('drop policy if exists "Admins manage %1$s" on public.%1$s', t);
    execute format('create policy "Admins manage %1$s" on public.%1$s for all using (public.has_role(auth.uid(), ''admin''::app_role)) with check (public.has_role(auth.uid(), ''admin''::app_role))', t);
  end loop;
end $$;

-- ============================================
-- BUDGET GUARD FUNCTION
-- ============================================
create or replace function public.qa_check_budget(_category text, _amount_cents integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  _month_start date := date_trunc('month', now())::date;
  _spent integer;
  _cap integer;
begin
  select coalesce(spent_cents, 0), coalesce(hard_cap_cents, 30000)
    into _spent, _cap
  from public.qa_budget_ledger
  where period = 'month' and period_start = _month_start and category = _category
  limit 1;

  if _spent is null then return true; end if;
  return (_spent + _amount_cents) <= _cap;
end;
$$;

create or replace function public.qa_record_spend(_category text, _amount_cents integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  _month_start date := date_trunc('month', now())::date;
  _week_start date := date_trunc('week', now())::date;
  _day_start date := current_date;
begin
  insert into public.qa_budget_ledger (period, period_start, category, spent_cents, hard_cap_cents)
  values ('month', _month_start, _category, _amount_cents, 30000)
  on conflict (period, period_start, category)
  do update set spent_cents = public.qa_budget_ledger.spent_cents + excluded.spent_cents, updated_at = now();

  insert into public.qa_budget_ledger (period, period_start, category, spent_cents, hard_cap_cents)
  values ('week', _week_start, _category, _amount_cents, 7500)
  on conflict (period, period_start, category)
  do update set spent_cents = public.qa_budget_ledger.spent_cents + excluded.spent_cents, updated_at = now();

  insert into public.qa_budget_ledger (period, period_start, category, spent_cents, hard_cap_cents)
  values ('day', _day_start, _category, _amount_cents, 1500)
  on conflict (period, period_start, category)
  do update set spent_cents = public.qa_budget_ledger.spent_cents + excluded.spent_cents, updated_at = now();
end;
$$;

-- Initialize budget allocation per category for current month
insert into public.qa_budget_ledger (period, period_start, category, budgeted_cents, hard_cap_cents)
values
  ('month', date_trunc('month', now())::date, 'ai_video', 18000, 18000),
  ('month', date_trunc('month', now())::date, 'ai_image', 3000, 3000),
  ('month', date_trunc('month', now())::date, 'voiceover', 2000, 2000),
  ('month', date_trunc('month', now())::date, 'music', 1500, 1500),
  ('month', date_trunc('month', now())::date, 'talking_head', 1500, 1500),
  ('month', date_trunc('month', now())::date, 'autopilot', 2500, 2500),
  ('month', date_trunc('month', now())::date, 'translator', 1000, 1000),
  ('month', date_trunc('month', now())::date, 'exploration', 500, 500)
on conflict (period, period_start, category) do nothing;

-- Seed provider rotation
insert into public.qa_provider_rotation (provider, category, enabled) values
  ('ai-hailuo', 'ai_video', true),
  ('ai-kling', 'ai_video', true),
  ('ai-seedance', 'ai_video', true),
  ('ai-wan', 'ai_video', true),
  ('ai-luma', 'ai_video', true),
  ('ai-sora', 'ai_video', true),
  ('ai-pika', 'ai_video', true),
  ('ai-vidu', 'ai_video', true),
  ('ai-runway', 'ai_video', true),
  ('ai-kling-omni', 'ai_video', true),
  ('flux-pro', 'ai_image', true),
  ('gemini-image', 'ai_image', true),
  ('elevenlabs-tts', 'voiceover', true),
  ('stable-audio', 'music', true),
  ('minimax-music', 'music', true),
  ('hedra', 'talking_head', true)
on conflict (provider) do nothing;
