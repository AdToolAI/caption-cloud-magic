#!/bin/bash

# Performance Test Script für AdTool AI
# Führt Lighthouse-Tests und Performance-Analysen durch

echo "🚀 Starting Performance Tests for AdTool AI..."
echo ""

# Farben für Output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# 1. Build prüfen
echo "📦 Building production bundle..."
npm run build

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Build successful${NC}"
else
    echo -e "${RED}✗ Build failed${NC}"
    exit 1
fi

echo ""

# 2. Bundle Size Analysis
echo "📊 Analyzing bundle size..."
echo "Run: npm run build -- --reporterOptions=analyzerMode=static,reportFilename=bundle-report.html"
echo ""

# 3. Lighthouse CI Tests
echo "🔍 Running Lighthouse CI tests..."
echo "Installing Lighthouse CI if needed..."
npm list -g @lhci/cli > /dev/null 2>&1 || npm install -g @lhci/cli

echo ""
echo "Running Lighthouse tests (3 runs, desktop preset)..."
lhci autorun

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Lighthouse tests completed${NC}"
else
    echo -e "${YELLOW}⚠ Some Lighthouse assertions failed - check report above${NC}"
fi

echo ""

# 4. Manual Test Prompts
echo "📝 Additional Manual Tests:"
echo ""
echo "1. PageSpeed Insights:"
echo "   → https://pagespeed.web.dev/?url=https://useadtool.ai"
echo ""
echo "2. WebPageTest:"
echo "   → https://www.webpagetest.org/"
echo "   → Test with 3G/4G throttling"
echo ""
echo "3. Chrome DevTools:"
echo "   → Open DevTools → Lighthouse Tab"
echo "   → Run tests for Mobile + Desktop"
echo "   → Check Performance, Accessibility, Best Practices, SEO"
echo ""
echo "4. Core Web Vitals Check:"
echo "   → Open Chrome DevTools → Performance Tab"
echo "   → Record page load and check:"
echo "     - LCP (Largest Contentful Paint): Target < 1.5s"
echo "     - FID (First Input Delay): Target < 50ms"
echo "     - CLS (Cumulative Layout Shift): Target < 0.05"
echo ""
echo "5. Security Headers Check:"
echo "   → https://securityheaders.com/?q=https://useadtool.ai"
echo "   → Target: A+ Rating"
echo ""

echo -e "${GREEN}✓ Performance test script completed${NC}"
echo ""
echo "Next Steps:"
echo "1. Review Lighthouse report above"
echo "2. Run manual tests from the list"
echo "3. Fix any issues found"
echo "4. Re-run tests to verify improvements"
