#!/bin/bash

# ============================================
# Load Test Results Analysis Script
# ============================================

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

RESULTS_DIR="tests/load/results"

if [ ! -d "$RESULTS_DIR" ]; then
    echo "No results directory found. Run ./run-load-tests.sh first."
    exit 1
fi

# Find the latest test results
LATEST_TIMESTAMP=$(ls -t "$RESULTS_DIR" | grep "auth-token" | head -1 | sed 's/auth-token_//' | sed 's/.json//')

if [ -z "$LATEST_TIMESTAMP" ]; then
    echo "No test results found."
    exit 1
fi

echo -e "${BLUE}Analyzing results from: ${LATEST_TIMESTAMP}${NC}\n"

# Function to extract metrics from JSON
extract_metrics() {
    local file=$1
    local metric=$2
    
    if [ ! -f "$file" ]; then
        echo "N/A"
        return
    fi
    
    if ! command -v jq &> /dev/null; then
        echo "jq not installed"
        return
    fi
    
    cat "$file" | jq -r "$metric" 2>/dev/null || echo "N/A"
}

# Analyze Auth Token Test
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${YELLOW}Auth Token Performance${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

AUTH_FILE="${RESULTS_DIR}/auth-token_${LATEST_TIMESTAMP}.json"
if [ -f "$AUTH_FILE" ]; then
    echo "Total Requests: $(extract_metrics "$AUTH_FILE" '.metrics.http_reqs.values.count')"
    echo "Request Rate: $(extract_metrics "$AUTH_FILE" '.metrics.http_reqs.values.rate') req/s"
    echo ""
    echo "Response Times:"
    echo "  Avg: $(extract_metrics "$AUTH_FILE" '.metrics.http_req_duration.values.avg') ms"
    echo "  P50: $(extract_metrics "$AUTH_FILE" '.metrics.http_req_duration.values["p(50)"]') ms"
    echo "  P95: $(extract_metrics "$AUTH_FILE" '.metrics.http_req_duration.values["p(95)"]') ms (Target: <100ms)"
    echo "  P99: $(extract_metrics "$AUTH_FILE" '.metrics.http_req_duration.values["p(99)"]') ms"
    echo "  Max: $(extract_metrics "$AUTH_FILE" '.metrics.http_req_duration.values.max') ms"
    echo ""
    echo "Error Rate: $(extract_metrics "$AUTH_FILE" '.metrics.http_req_failed.values.rate')"
    
    # Check if P95 meets target
    P95=$(extract_metrics "$AUTH_FILE" '.metrics.http_req_duration.values["p(95)"]')
    if (( $(echo "$P95 < 100" | bc -l 2>/dev/null || echo 0) )); then
        echo -e "${GREEN}✓ Auth Performance: PASS${NC}"
    else
        echo -e "${YELLOW}⚠ Auth Performance: NEEDS OPTIMIZATION${NC}"
    fi
else
    echo "No auth test results found"
fi

echo -e "\n"

# Analyze Planner List Test
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${YELLOW}Database Query Performance${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

PLANNER_FILE="${RESULTS_DIR}/planner-list_${LATEST_TIMESTAMP}.json"
if [ -f "$PLANNER_FILE" ]; then
    echo "Total Requests: $(extract_metrics "$PLANNER_FILE" '.metrics.http_reqs.values.count')"
    echo "Request Rate: $(extract_metrics "$PLANNER_FILE" '.metrics.http_reqs.values.rate') req/s"
    echo ""
    echo "Response Times:"
    echo "  Avg: $(extract_metrics "$PLANNER_FILE" '.metrics.http_req_duration.values.avg') ms"
    echo "  P50: $(extract_metrics "$PLANNER_FILE" '.metrics.http_req_duration.values["p(50)"]') ms"
    echo "  P95: $(extract_metrics "$PLANNER_FILE" '.metrics.http_req_duration.values["p(95)"]') ms (Target: <500ms)"
    echo "  P99: $(extract_metrics "$PLANNER_FILE" '.metrics.http_req_duration.values["p(99)"]') ms"
    echo "  Max: $(extract_metrics "$PLANNER_FILE" '.metrics.http_req_duration.values.max') ms"
    echo ""
    echo "Error Rate: $(extract_metrics "$PLANNER_FILE" '.metrics.http_req_failed.values.rate')"
    
    P95=$(extract_metrics "$PLANNER_FILE" '.metrics.http_req_duration.values["p(95)"]')
    if (( $(echo "$P95 < 500" | bc -l 2>/dev/null || echo 0) )); then
        echo -e "${GREEN}✓ Database Performance: PASS${NC}"
    else
        echo -e "${YELLOW}⚠ Database Performance: NEEDS OPTIMIZATION${NC}"
    fi
else
    echo "No planner test results found"
fi

echo -e "\n"

# Analyze Campaign Generation Test
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${YELLOW}AI Campaign Generation${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

CAMPAIGN_FILE="${RESULTS_DIR}/generate-campaign_${LATEST_TIMESTAMP}.json"
if [ -f "$CAMPAIGN_FILE" ]; then
    echo "Total Requests: $(extract_metrics "$CAMPAIGN_FILE" '.metrics.http_reqs.values.count')"
    echo "Request Rate: $(extract_metrics "$CAMPAIGN_FILE" '.metrics.http_reqs.values.rate') req/s"
    echo ""
    echo "Response Times:"
    echo "  Avg: $(extract_metrics "$CAMPAIGN_FILE" '.metrics.http_req_duration.values.avg') ms"
    echo "  P50: $(extract_metrics "$CAMPAIGN_FILE" '.metrics.http_req_duration.values["p(50)"]') ms"
    echo "  P95: $(extract_metrics "$CAMPAIGN_FILE" '.metrics.http_req_duration.values["p(95)"]') ms (Target: <800ms)"
    echo "  P99: $(extract_metrics "$CAMPAIGN_FILE" '.metrics.http_req_duration.values["p(99)"]') ms"
    echo "  Max: $(extract_metrics "$CAMPAIGN_FILE" '.metrics.http_req_duration.values.max') ms"
    echo ""
    echo "Error Rate: $(extract_metrics "$CAMPAIGN_FILE" '.metrics.http_req_failed.values.rate')"
    
    P95=$(extract_metrics "$CAMPAIGN_FILE" '.metrics.http_req_duration.values["p(95)"]')
    if (( $(echo "$P95 < 800" | bc -l 2>/dev/null || echo 0) )); then
        echo -e "${GREEN}✓ AI Performance: PASS${NC}"
    else
        echo -e "${YELLOW}⚠ AI Performance: NEEDS OPTIMIZATION${NC}"
    fi
else
    echo "No campaign test results found"
fi

echo -e "\n"

# Analyze Worker Test
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${YELLOW}Worker Throughput${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

WORKER_FILE="${RESULTS_DIR}/ai-queue-worker_${LATEST_TIMESTAMP}.json"
if [ -f "$WORKER_FILE" ]; then
    echo "Worker Invocations: $(extract_metrics "$WORKER_FILE" '.metrics.http_reqs.values.count')"
    echo "Total Jobs Processed: $(extract_metrics "$WORKER_FILE" '.metrics.jobs_processed.values.count')"
    echo "Jobs per Second: $(extract_metrics "$WORKER_FILE" '.metrics.jobs_processed.values.rate') (Target: ≥5.0)"
    echo ""
    echo "Batch Performance:"
    echo "  Avg Duration: $(extract_metrics "$WORKER_FILE" '.metrics.http_req_duration.values.avg') ms"
    echo "  P95 Duration: $(extract_metrics "$WORKER_FILE" '.metrics.http_req_duration.values["p(95)"]') ms (Target: <1000ms)"
    echo "  Max Duration: $(extract_metrics "$WORKER_FILE" '.metrics.http_req_duration.values.max') ms"
    echo ""
    echo "Error Rate: $(extract_metrics "$WORKER_FILE" '.metrics.http_req_failed.values.rate')"
    
    JOBS_SEC=$(extract_metrics "$WORKER_FILE" '.metrics.jobs_processed.values.rate')
    if (( $(echo "$JOBS_SEC >= 5.0" | bc -l 2>/dev/null || echo 0) )); then
        echo -e "${GREEN}✓ Worker Throughput: PASS${NC}"
    else
        echo -e "${YELLOW}⚠ Worker Throughput: BELOW TARGET${NC}"
    fi
else
    echo "No worker test results found (requires SERVICE_ROLE_KEY)"
fi

echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"

# Recommendations
echo -e "${YELLOW}Next Steps:${NC}"
echo "1. Fill out LOAD_TEST_RESULTS_TEMPLATE.md with these metrics"
echo "2. Run database analysis: psql < check-slow-queries.sql"
echo "3. Review PostHog dashboards for errors during test window"
echo "4. Document breaking points and bottlenecks"
echo ""
echo "Full JSON results available in: $RESULTS_DIR"
