import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');
const campaignDuration = new Trend('campaign_duration', true);

// Test configuration - Phase 2 optimizations
// Use light load by default - set K6_LOAD_LEVEL=medium or heavy for stress testing
const loadLevel = __ENV.K6_LOAD_LEVEL || 'light';
const loadProfiles = {
  light: [
    { duration: '30s', target: 5 },
    { duration: '1m', target: 20 },
    { duration: '30s', target: 0 },
  ],
  medium: [
    { duration: '1m', target: 20 },
    { duration: '2m', target: 50 },
    { duration: '1m', target: 100 },
    { duration: '1m', target: 0 },
  ],
  heavy: [
    { duration: '1m', target: 100 },
    { duration: '3m', target: 1000 },
    { duration: '2m', target: 2000 },
    { duration: '2m', target: 5000 },
    { duration: '2m', target: 0 },
  ],
};

export const options = {
  stages: loadProfiles[loadLevel],
  thresholds: {
    // P95 should be < 15s (AI generation takes time)
    'http_req_duration{scenario:generate_campaign}': ['p(95)<15000'],
    // Error rate should be < 1% (AI can occasionally fail)
    'errors': ['rate<0.01'],
    // Success rate should be > 95%
    'checks': ['rate>0.95'],
  },
};

// Test data
const topics = [
  'Fitness Tips for Beginners',
  'Healthy Breakfast Recipes',
  'Social Media Marketing Trends',
  'Productivity Hacks for Remote Work',
  'Sustainable Living Guide',
];

const platforms = [
  ['instagram', 'x'],
  ['tiktok', 'instagram'],
  ['linkedin', 'x'],
  ['instagram', 'facebook'],
];

export default function () {
  const supabaseUrl = __ENV.SUPABASE_URL || 'https://lbunafpxuskwmsrraqxl.supabase.co';
  const anonKey = __ENV.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxidW5hZnB4dXNrd21zcnJhcXhsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAxMjA3NzUsImV4cCI6MjA3NTY5Njc3NX0.gRvY8kUzrELzlhSdGNJj_CXsaT8mqaUO7F1jCEi2T7Y';
  
  // Get real test credentials from environment (set by setup.js)
  const accessToken = __ENV.K6_TEST_ACCESS_TOKEN || anonKey;
  
  if (!accessToken || accessToken === anonKey) {
    console.error('K6_TEST_ACCESS_TOKEN not set. Run: k6 run tests/load/setup.js first');
    return;
  }
  
  // Random test data
  const topic = topics[Math.floor(Math.random() * topics.length)];
  const selectedPlatforms = platforms[Math.floor(Math.random() * platforms.length)];
  
  const payload = JSON.stringify({
    topic: topic,
    platforms: selectedPlatforms,
    postCount: 3,
  });

  const params = {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
      'apikey': anonKey,
    },
    tags: { scenario: 'generate_campaign' },
    timeout: '30s', // AI generation can take time
  };

  const startTime = new Date();
  const response = http.post(
    `${supabaseUrl}/functions/v1/generate-campaign`,
    payload,
    params
  );
  const duration = new Date() - startTime;

  // Check response
  const success = check(response, {
    'status is 200 or 202': (r) => r.status === 200 || r.status === 202,
    'response has body': (r) => r.body && r.body.length > 0,
    'response time < 800ms': (r) => r.timings.duration < 800,
  });

  // Track metrics
  errorRate.add(!success);
  campaignDuration.add(duration);

  // Check for rate limiting (expected behavior)
  if (response.status === 429) {
    console.log(`Rate limited: ${response.headers['Retry-After']}s`);
    const retryAfter = parseInt(response.headers['Retry-After'] || '60');
    sleep(retryAfter);
    return;
  }

  // Check for errors
  if (response.status >= 400 && response.status !== 429) {
    console.error(`Error ${response.status}: ${response.body}`);
  }

  // Think time: simulate user reading generated campaign
  sleep(Math.random() * 3 + 2); // 2-5 seconds
}

export function handleSummary(data) {
  return {
    'summary.json': JSON.stringify(data),
    stdout: textSummary(data, { indent: ' ', enableColors: true }),
  };
}

function textSummary(data, options = {}) {
  const indent = options.indent || '';
  const enableColors = options.enableColors || false;
  
  let summary = `\n${indent}=== Load Test Summary: generate-campaign ===\n\n`;
  
  // Requests
  const requests = data.metrics.http_reqs?.values;
  if (requests) {
    summary += `${indent}Total Requests: ${requests.count}\n`;
    summary += `${indent}Request Rate: ${requests.rate.toFixed(2)}/s\n\n`;
  }
  
  // Duration
  const duration = data.metrics.http_req_duration?.values;
  if (duration) {
    summary += `${indent}Response Times:\n`;
    summary += `${indent}  Avg: ${duration.avg.toFixed(2)}ms\n`;
    summary += `${indent}  P95: ${duration['p(95)'].toFixed(2)}ms\n`;
    summary += `${indent}  P99: ${duration['p(99)'].toFixed(2)}ms\n`;
    summary += `${indent}  Max: ${duration.max.toFixed(2)}ms\n\n`;
  }
  
  // Errors
  const failed = data.metrics.http_req_failed?.values;
  if (failed) {
    const errorPercent = (failed.rate * 100).toFixed(2);
    summary += `${indent}Error Rate: ${errorPercent}%\n`;
  }
  
  // Thresholds
  summary += `\n${indent}Thresholds:\n`;
  Object.entries(data.thresholds || {}).forEach(([name, threshold]) => {
    const passed = threshold.ok ? '✓' : '✗';
    summary += `${indent}  ${passed} ${name}\n`;
  });
  
  return summary;
}
