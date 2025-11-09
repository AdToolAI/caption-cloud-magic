/**
 * Lighthouse CI Configuration for Phase 4 - AdTool AI
 * Performance targets after CDN activation:
 * - LCP < 1.5s (improved from 2.0s)
 * - FID < 50ms (improved from 100ms) 
 * - CLS < 0.05
 * - Lighthouse Score ≥ 98 (improved from 95)
 * 
 * Run in GitHub Actions or locally with:
 * npm install -g @lhci/cli && lhci autorun
 */
module.exports = {
  ci: {
    collect: {
      numberOfRuns: 3,
      settings: {
        preset: 'desktop',
        throttling: {
          rttMs: 40,
          throughputKbps: 10240,
          cpuSlowdownMultiplier: 1,
        },
      },
    },
    assert: {
      assertions: {
        // Lighthouse Categories
        'categories:performance': ['error', { minScore: 0.98 }],
        'categories:accessibility': ['error', { minScore: 0.95 }],
        'categories:best-practices': ['error', { minScore: 0.95 }],
        'categories:seo': ['error', { minScore: 0.95 }],
        
        // Core Web Vitals (Phase 4 targets)
        'first-contentful-paint': ['error', { maxNumericValue: 1500 }],
        'largest-contentful-paint': ['error', { maxNumericValue: 1500 }],
        'cumulative-layout-shift': ['error', { maxNumericValue: 0.05 }],
        'total-blocking-time': ['error', { maxNumericValue: 200 }],
        'speed-index': ['error', { maxNumericValue: 2500 }],
        
        // Resource Budgets (after CDN optimization)
        'resource-summary:script:size': ['error', { maxNumericValue: 250000 }],
        'resource-summary:image:size': ['error', { maxNumericValue: 300000 }],
        'resource-summary:document:size': ['error', { maxNumericValue: 50000 }],
        'resource-summary:font:size': ['error', { maxNumericValue: 150000 }],
        'resource-summary:stylesheet:size': ['error', { maxNumericValue: 100000 }],
        'resource-summary:third-party:size': ['error', { maxNumericValue: 200000 }],
      },
    },
    upload: {
      target: 'temporary-public-storage',
    },
  },
};
