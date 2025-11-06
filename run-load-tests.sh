#!/bin/bash

# ============================================
# Load Test Execution Script - Phase 2
# ============================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SUPABASE_URL="${SUPABASE_URL:-https://lbunafpxuskwmsrraqxl.supabase.co}"
SUPABASE_ANON_KEY="${SUPABASE_ANON_KEY:-eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxidW5hZnB4dXNrd21zcnJhcXhsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAxMjA3NzUsImV4cCI6MjA3NTY5Njc3NX0.gRvY8kUzrELzlhSdGNJj_CXsaT8mqaUO7F1jCEi2T7Y}"

# Results directory
RESULTS_DIR="tests/load/results"
mkdir -p "$RESULTS_DIR"

# Timestamp for this test run
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

echo -e "${BLUE}============================================${NC}"
echo -e "${BLUE}  Load Testing Suite - Phase 2${NC}"
echo -e "${BLUE}  Timestamp: $TIMESTAMP${NC}"
echo -e "${BLUE}============================================${NC}\n"

# Check if k6 is installed
if ! command -v k6 &> /dev/null; then
    echo -e "${RED}Error: k6 is not installed${NC}"
    echo -e "${YELLOW}Install k6:${NC}"
    echo "  macOS:   brew install k6"
    echo "  Linux:   sudo apt-get install k6"
    echo "  Windows: choco install k6"
    exit 1
fi

echo -e "${GREEN}✓ k6 found: $(k6 version)${NC}\n"

# Function to run a test
run_test() {
    local test_name=$1
    local test_file=$2
    local output_file="${RESULTS_DIR}/${test_name}_${TIMESTAMP}.json"
    
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${YELLOW}▶ Running: ${test_name}${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"
    
    if [ -n "$SUPABASE_SERVICE_ROLE_KEY" ]; then
        k6 run \
            -e SUPABASE_URL="$SUPABASE_URL" \
            -e SUPABASE_ANON_KEY="$SUPABASE_ANON_KEY" \
            -e SUPABASE_SERVICE_ROLE_KEY="$SUPABASE_SERVICE_ROLE_KEY" \
            --out json="$output_file" \
            "$test_file"
    else
        k6 run \
            -e SUPABASE_URL="$SUPABASE_URL" \
            -e SUPABASE_ANON_KEY="$SUPABASE_ANON_KEY" \
            --out json="$output_file" \
            "$test_file"
    fi
    
    local exit_code=$?
    
    if [ $exit_code -eq 0 ]; then
        echo -e "\n${GREEN}✓ Test passed: ${test_name}${NC}\n"
    else
        echo -e "\n${RED}✗ Test failed: ${test_name}${NC}\n"
    fi
    
    return $exit_code
}

# Track results
PASSED=0
FAILED=0
SKIPPED=0

# Test 1: Auth Token (Critical - must be fast)
echo -e "${BLUE}[1/4] Auth Token Performance Test${NC}"
if run_test "auth-token" "tests/load/auth-token.js"; then
    ((PASSED++))
else
    ((FAILED++))
fi
sleep 5

# Test 2: Planner List (Database Performance)
echo -e "${BLUE}[2/4] Database Query Performance Test${NC}"
if run_test "planner-list" "tests/load/planner-list.js"; then
    ((PASSED++))
else
    ((FAILED++))
fi
sleep 5

# Test 3: Generate Campaign (AI Load Test)
echo -e "${BLUE}[3/4] AI Campaign Generation Test${NC}"
echo -e "${YELLOW}⚠ This test may trigger rate limits (expected behavior)${NC}\n"
if run_test "generate-campaign" "tests/load/generate-campaign.js"; then
    ((PASSED++))
else
    ((FAILED++))
fi
sleep 5

# Test 4: AI Queue Worker (Requires Service Role Key)
echo -e "${BLUE}[4/4] Worker Throughput Test${NC}"
if [ -z "$SUPABASE_SERVICE_ROLE_KEY" ]; then
    echo -e "${YELLOW}⚠ Skipping ai-queue-worker test (SUPABASE_SERVICE_ROLE_KEY not set)${NC}"
    echo -e "${YELLOW}  Set with: export SUPABASE_SERVICE_ROLE_KEY=your-key${NC}\n"
    ((SKIPPED++))
else
    if run_test "ai-queue-worker" "tests/load/ai-queue-worker.js"; then
        ((PASSED++))
    else
        ((FAILED++))
    fi
fi

# Final Summary
echo -e "\n${BLUE}============================================${NC}"
echo -e "${BLUE}  Test Execution Summary${NC}"
echo -e "${BLUE}============================================${NC}\n"

echo -e "Total Tests: $((PASSED + FAILED + SKIPPED))"
echo -e "${GREEN}✓ Passed: ${PASSED}${NC}"
echo -e "${RED}✗ Failed: ${FAILED}${NC}"
echo -e "${YELLOW}⊘ Skipped: ${SKIPPED}${NC}\n"

echo -e "Results saved to: ${RESULTS_DIR}/"
echo -e "Timestamp: ${TIMESTAMP}\n"

# Generate summary report
SUMMARY_FILE="${RESULTS_DIR}/summary_${TIMESTAMP}.md"
cat > "$SUMMARY_FILE" << EOF
# Load Test Results - ${TIMESTAMP}

## Execution Summary

- **Total Tests:** $((PASSED + FAILED + SKIPPED))
- **Passed:** ${PASSED}
- **Failed:** ${FAILED}
- **Skipped:** ${SKIPPED}

## Test Results

### 1. Auth Token Performance
- File: \`auth-token_${TIMESTAMP}.json\`
- Status: $([ -f "${RESULTS_DIR}/auth-token_${TIMESTAMP}.json" ] && echo "✓ Executed" || echo "✗ Failed")
- Target: P95 < 100ms

### 2. Database Query Performance  
- File: \`planner-list_${TIMESTAMP}.json\`
- Status: $([ -f "${RESULTS_DIR}/planner-list_${TIMESTAMP}.json" ] && echo "✓ Executed" || echo "✗ Failed")
- Target: P95 < 500ms

### 3. AI Campaign Generation
- File: \`generate-campaign_${TIMESTAMP}.json\`
- Status: $([ -f "${RESULTS_DIR}/generate-campaign_${TIMESTAMP}.json" ] && echo "✓ Executed" || echo "✗ Failed")
- Target: P95 < 800ms

### 4. Worker Throughput
- File: \`ai-queue-worker_${TIMESTAMP}.json\`
- Status: $([ -f "${RESULTS_DIR}/ai-queue-worker_${TIMESTAMP}.json" ] && echo "✓ Executed" || echo "⊘ Skipped (No SERVICE_ROLE_KEY)")
- Target: ≥5 jobs/sec

## Next Steps

1. Analyze P95/P99 response times in JSON files
2. Identify bottlenecks and breaking points
3. Document findings in \`LOAD_TEST_RESULTS.md\`
4. Plan optimizations based on results

## Command to analyze results:

\`\`\`bash
# View summary of a test
cat ${RESULTS_DIR}/auth-token_${TIMESTAMP}.json | jq '.metrics.http_req_duration.values'
\`\`\`
EOF

echo -e "${GREEN}✓ Summary report saved to: ${SUMMARY_FILE}${NC}\n"

# Exit with failure if any tests failed
if [ $FAILED -gt 0 ]; then
    echo -e "${RED}Some tests failed. Review results and logs.${NC}"
    exit 1
else
    echo -e "${GREEN}All tests passed! 🎉${NC}"
    exit 0
fi
