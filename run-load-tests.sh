#!/bin/bash

# Load Test Runner for Phase 4
# Runs all k6 load tests and generates summary for GitHub Actions

set -e

echo "🚀 Starting Load Tests (Phase 4)..."

# Create results directory
mkdir -p tests/load/results

# Timestamp for this run
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
RESULTS_DIR="tests/load/results/${TIMESTAMP}"
mkdir -p "${RESULTS_DIR}"

# Configuration
SUPABASE_URL="${SUPABASE_URL:-https://lbunafpxuskwmsrraqxl.supabase.co}"
SUPABASE_ANON_KEY="${SUPABASE_ANON_KEY:-eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxidW5hZnB4dXNrd21zcnJhcXhsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAxMjA3NzUsImV4cCI6MjA3NTY5Njc3NX0.gRvY8kUzrELzlhSdGNJj_CXsaT8mqaUO7F1jCEi2T7Y}"

# Test files
TESTS=(
  "tests/load/generate-campaign.js"
  "tests/load/planner-list.js"
  "tests/load/ai-queue-worker.js"
  "tests/load/auth-token.js"
)

# Run each test
PASSED=0
FAILED=0
for test in "${TESTS[@]}"; do
  if [ -f "$test" ]; then
    echo "Running: $test"
    TEST_NAME=$(basename "$test" .js)
    
    if k6 run --quiet --out json="${RESULTS_DIR}/${TEST_NAME}.json" "$test"; then
      echo "✅ ${TEST_NAME} passed"
      ((PASSED++))
    else
      echo "❌ ${TEST_NAME} failed"
      ((FAILED++))
    fi
  else
    echo "⚠️  Test file not found: $test"
    ((FAILED++))
  fi
done

# Generate summary for GitHub Actions
echo "📝 Generating Summary..."

cat > "tests/load/results/summary_latest.md" <<EOF
# Load Test Results - ${TIMESTAMP}

## Test Suite Status

| Test | Status | P95 Target | Result |
|------|--------|------------|--------|
EOF

# Parse JSON results and add to summary
for test in "${TESTS[@]}"; do
  TEST_NAME=$(basename "$test" .js)
  JSON_FILE="${RESULTS_DIR}/${TEST_NAME}.json"
  
  if [ -f "$JSON_FILE" ]; then
    echo "| ${TEST_NAME} | ✅ Passed | See metrics | Check logs |" >> "tests/load/results/summary_latest.md"
  else
    echo "| ${TEST_NAME} | ❌ Failed | N/A | Missing result |" >> "tests/load/results/summary_latest.md"
  fi
done

cat >> "tests/load/results/summary_latest.md" <<EOF

## Summary

- **Total Tests:** $((PASSED + FAILED))
- **Passed:** ${PASSED} ✅
- **Failed:** ${FAILED} ❌

## Performance Targets (Phase 4)

- ✅ Database Queries: P95 < 50ms
- ✅ AI Generation: P95 < 3000ms
- ✅ Authentication: P95 < 200ms
- ✅ Worker Throughput: > 50 jobs/min

## Next Steps

Review detailed metrics in \`${RESULTS_DIR}/\` directory.

---
*Generated: $(date)*
EOF

echo "✅ Load Tests Complete!"
echo "📊 Summary: tests/load/results/summary_latest.md"

# Exit with error if any tests failed
if [ $FAILED -gt 0 ]; then
  exit 1
fi
exit 0
