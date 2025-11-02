#!/bin/bash

# Security Audit Script for Production Hardening
# Scans for common security issues in the codebase

set -e

echo "🔒 Starting Security Audit..."
echo "================================"
echo ""

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

ISSUES_FOUND=0

# 1. Check for exposed PII in logs
echo "📋 Checking for PII in logs..."
if grep -rn "console.log.*email" supabase/functions/ 2>/dev/null | grep -v "// "; then
    echo -e "${RED}❌ Found email in console.logs!${NC}"
    ((ISSUES_FOUND++))
else
    echo -e "${GREEN}✅ No email logs found${NC}"
fi

if grep -rn "console.log.*password" supabase/functions/ 2>/dev/null | grep -v "// "; then
    echo -e "${RED}❌ Found password in console.logs!${NC}"
    ((ISSUES_FOUND++))
else
    echo -e "${GREEN}✅ No password logs found${NC}"
fi

if grep -rn "console.log.*token" supabase/functions/ 2>/dev/null | grep -v "// " | grep -v "access_token" | grep -v "refresh_token"; then
    echo -e "${RED}❌ Found token in console.logs!${NC}"
    ((ISSUES_FOUND++))
else
    echo -e "${GREEN}✅ No sensitive token logs found${NC}"
fi

echo ""

# 2. Check for hardcoded secrets
echo "🔑 Checking for hardcoded secrets..."
if grep -rn "sk_live_" supabase/functions/ src/ 2>/dev/null; then
    echo -e "${RED}❌ Found hardcoded Stripe live key!${NC}"
    ((ISSUES_FOUND++))
else
    echo -e "${GREEN}✅ No hardcoded Stripe keys${NC}"
fi

if grep -rn "Bearer [A-Za-z0-9_-]\{20,\}" supabase/functions/ src/ 2>/dev/null | grep -v "Bearer \${"; then
    echo -e "${RED}❌ Found hardcoded Bearer tokens!${NC}"
    ((ISSUES_FOUND++))
else
    echo -e "${GREEN}✅ No hardcoded Bearer tokens${NC}"
fi

echo ""

# 3. Check for SQL injection risks
echo "💉 Checking for SQL injection risks..."
if grep -rn "\.query(" supabase/functions/ 2>/dev/null | grep -v "// " | grep -v "queryClient"; then
    echo -e "${YELLOW}⚠️  Found .query() usage - verify parameterized queries${NC}"
    ((ISSUES_FOUND++))
else
    echo -e "${GREEN}✅ No direct SQL queries found${NC}"
fi

echo ""

# 4. Check for missing error handling
echo "🛡️ Checking error handling..."
FUNCTIONS_WITHOUT_TRY_CATCH=$(find supabase/functions -name "index.ts" -type f -exec sh -c '
    if ! grep -q "try {" "$1" || ! grep -q "catch" "$1"; then
        echo "$1"
    fi
' _ {} \;)

if [ -n "$FUNCTIONS_WITHOUT_TRY_CATCH" ]; then
    echo -e "${YELLOW}⚠️  Functions without try-catch:${NC}"
    echo "$FUNCTIONS_WITHOUT_TRY_CATCH"
    ((ISSUES_FOUND++))
else
    echo -e "${GREEN}✅ All functions have error handling${NC}"
fi

echo ""

# 5. Check for CORS misconfiguration
echo "🌐 Checking CORS configuration..."
FUNCTIONS_WITHOUT_CORS=$(find supabase/functions -name "index.ts" -type f -exec sh -c '
    if ! grep -q "corsHeaders" "$1" && ! grep -q "Access-Control-Allow-Origin" "$1"; then
        echo "$1"
    fi
' _ {} \;)

if [ -n "$FUNCTIONS_WITHOUT_CORS" ]; then
    echo -e "${YELLOW}⚠️  Functions without CORS headers:${NC}"
    echo "$FUNCTIONS_WITHOUT_CORS"
    ((ISSUES_FOUND++))
else
    echo -e "${GREEN}✅ All functions have CORS configured${NC}"
fi

echo ""

# 6. Check for rate limiting
echo "⏱️ Checking rate limiting implementation..."
if grep -rq "RateLimiter" supabase/functions/*/index.ts 2>/dev/null; then
    echo -e "${GREEN}✅ Rate limiting implemented${NC}"
else
    echo -e "${YELLOW}⚠️  No rate limiting found in edge functions${NC}"
    ((ISSUES_FOUND++))
fi

echo ""

# 7. Check for environment variables usage
echo "🔧 Checking environment variable usage..."
if grep -rn "process.env" supabase/functions/ 2>/dev/null; then
    echo -e "${RED}❌ Found process.env - use Deno.env.get() instead${NC}"
    ((ISSUES_FOUND++))
else
    echo -e "${GREEN}✅ Using Deno.env.get() correctly${NC}"
fi

echo ""

# Summary
echo "================================"
if [ $ISSUES_FOUND -eq 0 ]; then
    echo -e "${GREEN}🎉 Security audit passed with no critical issues!${NC}"
    exit 0
else
    echo -e "${YELLOW}⚠️  Security audit found $ISSUES_FOUND potential issues${NC}"
    echo "Review the findings above and address before production deployment."
    exit 1
fi
