#!/bin/bash

# Load Test Results Analyzer (Enhanced for Phase 4 Redis Cache)
# Extracts and presents detailed metrics from k6 JSON output

set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

RESULTS_DIR="tests/load/results"

if [ ! -d "$RESULTS_DIR" ]; then
  echo -e "${RED}❌ Results directory not found: $RESULTS_DIR${NC}"
  echo "Run load tests first: ./run-load-tests.sh"
  exit 1
fi

# Find latest results timestamp
LATEST=$(find "$RESULTS_DIR" -maxdepth 2 -name "*.json" -type f 2>/dev/null | grep -oE "[0-9]{8}_[0-9]{6}" | sort -r | head -1)

if [ -z "$LATEST" ]; then
  echo -e "${RED}❌ No test results found in $RESULTS_DIR${NC}"
  echo "Run load tests first: ./run-load-tests.sh"
  exit 1
fi

echo -e "\n${BOLD}${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${BOLD}${CYAN}   📊 Load Test Results Analysis - ${LATEST}${NC}"
echo -e "${BOLD}${BLUE}═══════════════════════════════════════════════════════════════${NC}\n"

# Check for jq
if ! command -v jq &> /dev/null; then
  echo -e "${RED}❌ jq is not installed. Please install jq to analyze results.${NC}"
  echo "macOS: brew install jq"
  echo "Linux: sudo apt-get install jq"
  exit 1
fi

# Helper function to extract metrics
extract_metric() {
  local file=$1
  local metric=$2
  
  if [ ! -f "$file" ]; then
    echo "N/A"
    return
  fi
  
  jq -r ".metrics.${metric}.values // \"N/A\"" "$file" 2>/dev/null || echo "N/A"
}

# Helper function to format numbers
format_number() {
  local num=$1
  if [ "$num" = "N/A" ] || [ -z "$num" ]; then
    echo "N/A"
  elif [[ $num =~ ^[0-9]+\.?[0-9]*$ ]]; then
    printf "%.2f" "$num"
  else
    echo "$num"
  fi
}

# Helper function to check threshold
check_threshold() {
  local value=$1
  local threshold=$2
  local comparison=$3  # "lt" for less than, "gt" for greater than
  
  if [ "$value" = "N/A" ]; then
    echo "⚠️"
    return
  fi
  
  if [ "$comparison" = "lt" ]; then
    if (( $(echo "$value < $threshold" | bc -l) )); then
      echo "✅"
    else
      echo "❌"
    fi
  elif [ "$comparison" = "gt" ]; then
    if (( $(echo "$value > $threshold" | bc -l) )); then
      echo "✅"
    else
      echo "❌"
    fi
  fi
}

# === Test Summary Table ===
echo -e "${BOLD}${CYAN}📋 Test Summary${NC}\n"

printf "%-30s %-12s %-12s %-12s %-10s %-10s\n" "Test" "Requests" "Avg (ms)" "P95 (ms)" "Target" "Status"
echo "────────────────────────────────────────────────────────────────────────────────────"

# Auth Token Performance
AUTH_FILE="$RESULTS_DIR/${LATEST}/auth-token.json"
if [ -f "$AUTH_FILE" ]; then
  REQUESTS=$(extract_metric "$AUTH_FILE" "http_reqs.count" | jq -r 'if type == "object" then .count else . end' 2>/dev/null)
  AVG=$(extract_metric "$AUTH_FILE" "http_req_duration.avg" | jq -r 'if type == "object" then .avg else . end' 2>/dev/null)
  P95=$(extract_metric "$AUTH_FILE" "http_req_duration.\"p(95)\"" | jq -r 'if type == "object" then .["p(95)"] else . end' 2>/dev/null)
  STATUS=$(check_threshold "$P95" "100" "lt")
  printf "%-30s %-12s %-12s %-12s %-10s %-10s\n" "Auth Token" "$(format_number $REQUESTS)" "$(format_number $AVG)" "$(format_number $P95)" "< 100ms" "$STATUS"
fi

# Planner List Performance
PLANNER_FILE="$RESULTS_DIR/${LATEST}/planner-list.json"
if [ -f "$PLANNER_FILE" ]; then
  REQUESTS=$(extract_metric "$PLANNER_FILE" "http_reqs.count" | jq -r 'if type == "object" then .count else . end' 2>/dev/null)
  AVG=$(extract_metric "$PLANNER_FILE" "http_req_duration.avg" | jq -r 'if type == "object" then .avg else . end' 2>/dev/null)
  P95=$(extract_metric "$PLANNER_FILE" "http_req_duration.\"p(95)\"" | jq -r 'if type == "object" then .["p(95)"] else . end' 2>/dev/null)
  STATUS=$(check_threshold "$P95" "200" "lt")
  printf "%-30s %-12s %-12s %-12s %-10s %-10s\n" "Planner List" "$(format_number $REQUESTS)" "$(format_number $AVG)" "$(format_number $P95)" "< 200ms" "$STATUS"
fi

# Dashboard Summary Performance
DASHBOARD_FILE="$RESULTS_DIR/${LATEST}/dashboard-summary.json"
if [ -f "$DASHBOARD_FILE" ]; then
  REQUESTS=$(extract_metric "$DASHBOARD_FILE" "http_reqs.count" | jq -r 'if type == "object" then .count else . end' 2>/dev/null)
  AVG=$(extract_metric "$DASHBOARD_FILE" "http_req_duration.avg" | jq -r 'if type == "object" then .avg else . end' 2>/dev/null)
  P95=$(extract_metric "$DASHBOARD_FILE" "http_req_duration.\"p(95)\"" | jq -r 'if type == "object" then .["p(95)"] else . end' 2>/dev/null)
  STATUS=$(check_threshold "$P95" "300" "lt")
  printf "%-30s %-12s %-12s %-12s %-10s %-10s\n" "Dashboard Summary" "$(format_number $REQUESTS)" "$(format_number $AVG)" "$(format_number $P95)" "< 300ms" "$STATUS"
fi

# Posting Times API Performance
POSTING_FILE="$RESULTS_DIR/${LATEST}/posting-times.json"
if [ -f "$POSTING_FILE" ]; then
  REQUESTS=$(extract_metric "$POSTING_FILE" "http_reqs.count" | jq -r 'if type == "object" then .count else . end' 2>/dev/null)
  AVG=$(extract_metric "$POSTING_FILE" "http_req_duration.avg" | jq -r 'if type == "object" then .avg else . end' 2>/dev/null)
  P95=$(extract_metric "$POSTING_FILE" "http_req_duration.\"p(95)\"" | jq -r 'if type == "object" then .["p(95)"] else . end' 2>/dev/null)
  STATUS=$(check_threshold "$P95" "200" "lt")
  printf "%-30s %-12s %-12s %-12s %-10s %-10s\n" "Posting Times API" "$(format_number $REQUESTS)" "$(format_number $AVG)" "$(format_number $P95)" "< 200ms" "$STATUS"
fi

# Generate Campaign Performance
CAMPAIGN_FILE="$RESULTS_DIR/${LATEST}/generate-campaign.json"
if [ -f "$CAMPAIGN_FILE" ]; then
  REQUESTS=$(extract_metric "$CAMPAIGN_FILE" "http_reqs.count" | jq -r 'if type == "object" then .count else . end' 2>/dev/null)
  AVG=$(extract_metric "$CAMPAIGN_FILE" "http_req_duration.avg" | jq -r 'if type == "object" then .avg else . end' 2>/dev/null)
  P95=$(extract_metric "$CAMPAIGN_FILE" "http_req_duration.\"p(95)\"" | jq -r 'if type == "object" then .["p(95)"] else . end' 2>/dev/null)
  STATUS=$(check_threshold "$P95" "3000" "lt")
  printf "%-30s %-12s %-12s %-12s %-10s %-10s\n" "Generate Campaign" "$(format_number $REQUESTS)" "$(format_number $AVG)" "$(format_number $P95)" "< 3000ms" "$STATUS"
fi

echo ""

# === Cache Performance Analysis ===
echo -e "${BOLD}${CYAN}🔥 Redis Cache Performance${NC}\n"

# Function to analyze cache hits/misses from logs
analyze_cache_performance() {
  local file=$1
  local test_name=$2
  
  if [ ! -f "$file" ]; then
    return
  fi
  
  # Try to extract cache metrics from custom metrics if available
  local cache_hits=$(jq -r '.metrics.cache_hits.values.count // 0' "$file" 2>/dev/null)
  local cache_misses=$(jq -r '.metrics.cache_misses.values.count // 0' "$file" 2>/dev/null)
  local total=$((cache_hits + cache_misses))
  
  if [ "$total" -gt 0 ]; then
    local hit_rate=$(echo "scale=2; ($cache_hits / $total) * 100" | bc)
    printf "%-30s %10s %10s %10s\n" "$test_name" "$cache_hits" "$cache_misses" "${hit_rate}%"
    
    # Evaluate cache performance
    if (( $(echo "$hit_rate >= 70" | bc -l) )); then
      echo -e "  ${GREEN}✓ Excellent cache performance${NC}"
    elif (( $(echo "$hit_rate >= 50" | bc -l) )); then
      echo -e "  ${YELLOW}⚠ Moderate cache performance - consider longer TTL${NC}"
    else
      echo -e "  ${RED}✗ Poor cache performance - investigate cache strategy${NC}"
    fi
  fi
}

printf "%-30s %10s %10s %10s\n" "Test" "Hits" "Misses" "Hit Rate"
echo "────────────────────────────────────────────────────────────────────"

analyze_cache_performance "$PLANNER_FILE" "Planner List"
analyze_cache_performance "$DASHBOARD_FILE" "Dashboard Summary"
analyze_cache_performance "$POSTING_FILE" "Posting Times API"

echo ""

# === Performance Recommendations ===
echo -e "${BOLD}${CYAN}💡 Recommendations & Next Steps${NC}\n"

# Check if any test failed targets
FAILED_TESTS=0

if [ -f "$AUTH_FILE" ]; then
  P95=$(extract_metric "$AUTH_FILE" "http_req_duration.\"p(95)\"" | jq -r 'if type == "object" then .["p(95)"] else . end' 2>/dev/null)
  if [ "$P95" != "N/A" ] && (( $(echo "$P95 >= 100" | bc -l) )); then
    echo -e "${YELLOW}⚠️  Auth Token P95 > 100ms${NC}"
    echo "   → Consider adding Redis caching to auth token validation"
    echo "   → Check database connection pool settings"
    FAILED_TESTS=$((FAILED_TESTS + 1))
  fi
fi

if [ -f "$PLANNER_FILE" ]; then
  P95=$(extract_metric "$PLANNER_FILE" "http_req_duration.\"p(95)\"" | jq -r 'if type == "object" then .["p(95)"] else . end' 2>/dev/null)
  if [ "$P95" != "N/A" ] && (( $(echo "$P95 >= 200" | bc -l) )); then
    echo -e "${YELLOW}⚠️  Planner List P95 > 200ms${NC}"
    echo "   → Verify Redis cache is working (check cache-stats function)"
    echo "   → Increase cache TTL if hit rate is low"
    echo "   → Consider adding database indexes on workspace_id + date"
    FAILED_TESTS=$((FAILED_TESTS + 1))
  fi
fi

if [ -f "$DASHBOARD_FILE" ]; then
  P95=$(extract_metric "$DASHBOARD_FILE" "http_req_duration.\"p(95)\"" | jq -r 'if type == "object" then .["p(95)"] else . end' 2>/dev/null)
  if [ "$P95" != "N/A" ] && (( $(echo "$P95 >= 300" | bc -l) )); then
    echo -e "${YELLOW}⚠️  Dashboard Summary P95 > 300ms${NC}"
    echo "   → Verify cache hit rate (should be > 70%)"
    echo "   → Consider materialized views for aggregated data"
    echo "   → Optimize COUNT(*) queries with approximate counts"
    FAILED_TESTS=$((FAILED_TESTS + 1))
  fi
fi

if [ -f "$POSTING_FILE" ]; then
  P95=$(extract_metric "$POSTING_FILE" "http_req_duration.\"p(95)\"" | jq -r 'if type == "object" then .["p(95)"] else . end' 2>/dev/null)
  if [ "$P95" != "N/A" ] && (( $(echo "$P95 >= 200" | bc -l) )); then
    echo -e "${YELLOW}⚠️  Posting Times API P95 > 200ms${NC}"
    echo "   → This data should be almost 100% cached"
    echo "   → Check cache TTL (should be > 1 hour for static data)"
    echo "   → Verify cache invalidation isn't too aggressive"
    FAILED_TESTS=$((FAILED_TESTS + 1))
  fi
fi

if [ "$FAILED_TESTS" -eq 0 ]; then
  echo -e "${GREEN}✅ All performance targets met!${NC}"
  echo ""
  echo "Next Steps:"
  echo "1. 📊 Add Cache Monitoring Widget to admin dashboard"
  echo "2. 🚀 Implement Virtual Scrolling for large lists"
  echo "3. 🖼️  Add Image Optimization with Supabase Transformations"
  echo "4. 📈 Monitor cache hit rates in production"
else
  echo ""
  echo "Priority Actions:"
  echo "1. 🔍 Review failed tests above"
  echo "2. 🔧 Invoke cache-stats function to check Redis metrics"
  echo "3. 📊 Check Supabase dashboard for database performance"
  echo "4. 🔄 Adjust cache TTLs based on data volatility"
fi

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "Full JSON results available in: ${CYAN}$RESULTS_DIR/${LATEST}/${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
