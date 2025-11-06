#!/bin/bash

# Load Testing Script for Phase 2 Performance Tests
# This script runs setup, all k6 load tests, and generates a summary report

set -e  # Exit on any error

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo "=================================================="
echo "  Load Testing Suite - Phase 2"
echo "=================================================="
echo ""

# Configuration
SUPABASE_URL="${SUPABASE_URL:-https://lbunafpxuskwmsrraqxl.supabase.co}"
SUPABASE_ANON_KEY="${SUPABASE_ANON_KEY:-eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxidW5hZnB4dXNrd21zcnJhcXhsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAxMjA3NzUsImV4cCI6MjA3NTY5Njc3NX0.gRvY8kUzrELzlhSdGNJj_CXsaT8mqaUO7F1jCEi2T7Y}"
LOAD_LEVEL="${K6_LOAD_LEVEL:-light}"

# Create results directory
RESULTS_DIR="tests/load/results"
mkdir -p "$RESULTS_DIR"

# Timestamp for this test run
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Check if k6 is installed
if ! command -v k6 &> /dev/null; then
    echo -e "${RED}Error: k6 is not installed${NC}"
    echo "Please install k6 from: https://k6.io/docs/get-started/installation/"
    echo ""
    echo "Installation commands:"
    echo "  macOS:   brew install k6"
    echo "  Linux:   sudo snap install k6"
    echo "  Windows: choco install k6"
    exit 1
fi

echo -e "${BLUE}Using load level: ${LOAD_LEVEL}${NC}"
echo "Set K6_LOAD_LEVEL=medium or K6_LOAD_LEVEL=heavy for stress testing"
echo ""

# Check if config exists, if not run setup
if [ ! -f "tests/load/config.json" ]; then
    echo -e "${YELLOW}No config found. Running setup first...${NC}"
    echo ""
    
    SUPABASE_URL="$SUPABASE_URL" \
    SUPABASE_ANON_KEY="$SUPABASE_ANON_KEY" \
    k6 run tests/load/setup.js > "$RESULTS_DIR/setup_${TIMESTAMP}.log" 2>&1
    
    # Extract credentials from setup log
    if grep -q "K6_TEST_ACCESS_TOKEN" "$RESULTS_DIR/setup_${TIMESTAMP}.log"; then
        echo -e "${GREEN}✓ Setup completed successfully${NC}"
        
        # Parse credentials from output
        export K6_TEST_USER_EMAIL=$(grep "K6_TEST_USER_EMAIL" "$RESULTS_DIR/setup_${TIMESTAMP}.log" | cut -d'"' -f2)
        export K6_TEST_ACCESS_TOKEN=$(grep "K6_TEST_ACCESS_TOKEN" "$RESULTS_DIR/setup_${TIMESTAMP}.log" | cut -d'"' -f2)
        export K6_TEST_WORKSPACE_ID=$(grep "K6_TEST_WORKSPACE_ID" "$RESULTS_DIR/setup_${TIMESTAMP}.log" | cut -d'"' -f2)
        
        echo "Test credentials configured"
        echo ""
    else
        echo -e "${RED}✗ Setup failed. Check logs: $RESULTS_DIR/setup_${TIMESTAMP}.log${NC}"
        exit 1
    fi
else
    echo -e "${GREEN}Using existing config from tests/load/config.json${NC}"
    echo ""
    
    # TODO: Parse config.json to set env vars (requires jq)
    if command -v jq &> /dev/null; then
        export K6_TEST_USER_EMAIL=$(jq -r '.testUser.email' tests/load/config.json)
        export K6_TEST_ACCESS_TOKEN=$(jq -r '.testUser.accessToken' tests/load/config.json)
        export K6_TEST_WORKSPACE_ID=$(jq -r '.testWorkspaceId' tests/load/config.json)
        echo "Loaded test credentials from config"
    else
        echo -e "${YELLOW}Warning: jq not installed. Please set env vars manually:${NC}"
        echo "  export K6_TEST_USER_EMAIL=<email>"
        echo "  export K6_TEST_ACCESS_TOKEN=<token>"
        echo "  export K6_TEST_WORKSPACE_ID=<workspace_id>"
        echo ""
    fi
fi

# Function to run a test
run_test() {
    local test_name=$1
    local test_file=$2
    local output_file="${RESULTS_DIR}/${test_name}_${TIMESTAMP}.json"
    
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${YELLOW}▶ Running: ${test_name}${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"
    
    # Set all environment variables
    export SUPABASE_URL="$SUPABASE_URL"
    export SUPABASE_ANON_KEY="$SUPABASE_ANON_KEY"
    export SUPABASE_SERVICE_ROLE_KEY="$SUPABASE_SERVICE_ROLE_KEY"
    export K6_LOAD_LEVEL="$LOAD_LEVEL"
    export K6_TEST_USER_EMAIL="$K6_TEST_USER_EMAIL"
    export K6_TEST_ACCESS_TOKEN="$K6_TEST_ACCESS_TOKEN"
    export K6_TEST_WORKSPACE_ID="$K6_TEST_WORKSPACE_ID"
    
    k6 run --out json="$output_file" "$test_file"
    
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
