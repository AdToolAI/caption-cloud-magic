-- ============================================
-- Database Performance Analysis
-- Run after load tests to identify slow queries
-- ============================================

-- Enable timing
\timing on

-- 1. Top 10 Slowest Queries
SELECT 
  substring(query, 1, 80) as query_preview,
  calls,
  mean_exec_time::numeric(10,2) as avg_ms,
  total_exec_time::numeric(10,2) as total_ms,
  (total_exec_time / sum(total_exec_time) OVER ()) * 100 as pct_total
FROM pg_stat_statements
WHERE query NOT LIKE '%pg_stat_statements%'
ORDER BY mean_exec_time DESC
LIMIT 10;

-- 2. Unused Indexes (Should be empty after load tests)
SELECT 
  schemaname,
  tablename,
  indexname,
  idx_scan as scans,
  idx_tup_read as tuples_read,
  idx_tup_fetch as tuples_fetched
FROM pg_stat_user_indexes
WHERE idx_scan = 0
  AND schemaname = 'public'
ORDER BY schemaname, tablename;

-- 3. Table Statistics (Most accessed tables)
SELECT 
  schemaname,
  tablename,
  seq_scan as sequential_scans,
  seq_tup_read as seq_tuples,
  idx_scan as index_scans,
  idx_tup_fetch as idx_tuples,
  CASE 
    WHEN (seq_scan + idx_scan) > 0 
    THEN (idx_scan::float / (seq_scan + idx_scan) * 100)::numeric(10,2)
    ELSE 0
  END as index_usage_pct
FROM pg_stat_user_tables
WHERE schemaname = 'public'
ORDER BY (seq_scan + idx_scan) DESC
LIMIT 10;

-- 4. Index Hit Rate (Should be >95%)
SELECT 
  'index hit rate' AS name,
  (sum(idx_blks_hit)) / nullif(sum(idx_blks_hit + idx_blks_read),0) * 100 AS ratio
FROM pg_statio_user_indexes
UNION ALL
SELECT 
  'table hit rate' AS name,
  sum(heap_blks_hit) / nullif(sum(heap_blks_hit + heap_blks_read),0) * 100 AS ratio
FROM pg_statio_user_tables;

-- 5. Content Items Query Performance (Critical Path)
EXPLAIN ANALYZE
SELECT * FROM content_items
WHERE workspace_id = (SELECT id FROM workspaces LIMIT 1)
ORDER BY created_at DESC
LIMIT 50;

-- 6. Calendar Events Query Performance
EXPLAIN ANALYZE
SELECT * FROM calendar_events
WHERE workspace_id = (SELECT id FROM workspaces LIMIT 1)
  AND scheduled_for >= NOW()
  AND scheduled_for <= NOW() + INTERVAL '30 days'
ORDER BY scheduled_for ASC;

-- 7. AI Jobs Queue Query Performance
EXPLAIN ANALYZE
SELECT * FROM ai_jobs
WHERE status = 'pending'
ORDER BY priority DESC, created_at ASC
LIMIT 5;

-- 8. Connection Stats
SELECT 
  datname,
  numbackends as connections,
  xact_commit as transactions_committed,
  xact_rollback as transactions_rolled_back,
  blks_read as disk_blocks_read,
  blks_hit as cache_blocks_hit,
  CASE 
    WHEN (blks_read + blks_hit) > 0
    THEN (blks_hit::float / (blks_read + blks_hit) * 100)::numeric(10,2)
    ELSE 0
  END as cache_hit_ratio
FROM pg_stat_database
WHERE datname = current_database();

-- 9. Lock Waits (Should be minimal)
SELECT 
  relation::regclass as table_name,
  mode as lock_mode,
  count(*) as lock_count
FROM pg_locks
WHERE relation IS NOT NULL
GROUP BY relation, mode
ORDER BY lock_count DESC;

-- 10. Vacuum Stats (Check if tables need maintenance)
SELECT 
  schemaname,
  tablename,
  last_vacuum,
  last_autovacuum,
  n_dead_tup as dead_tuples,
  n_live_tup as live_tuples,
  CASE 
    WHEN n_live_tup > 0
    THEN (n_dead_tup::float / n_live_tup * 100)::numeric(10,2)
    ELSE 0
  END as dead_tuple_pct
FROM pg_stat_user_tables
WHERE schemaname = 'public'
  AND n_dead_tup > 1000
ORDER BY n_dead_tup DESC;
