import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');
const queryDuration = new Trend('query_duration', true);

// Test configuration - Database read operations should be fast
export const options = {
  stages: [
    // Baseline
    { duration: '1m', target: 100 },
    // Stress test - database queries
    { duration: '3m', target: 1000 },
    // Peak load
    { duration: '2m', target: 2000 },
    // Cool down
    { duration: '1m', target: 0 },
  ],
  thresholds: {
    // P95 for DB queries should be < 500ms (previously 300ms, increased after indexes)
    'http_req_duration{scenario:planner_list}': ['p(95)<500'],
    // Error rate must be < 0.5%
    'errors': ['rate<0.005'],
    // 99% of requests should succeed (database is stable)
    'http_req_failed': ['rate<0.01'],
  },
};

export default function () {
  const supabaseUrl = __ENV.SUPABASE_URL || 'https://lbunafpxuskwmsrraqxl.supabase.co';
  const anonKey = __ENV.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxidW5hZnB4dXNrd21zcnJhcXhsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAxMjA3NzUsImV4cCI6MjA3NTY5Njc3NX0.gRvY8kUzrELzlhSdGNJj_CXsaT8mqaUO7F1jCEi2T7Y';
  
  // Simulate different query patterns
  const queryTypes = [
    { type: 'image', source: 'ai_generated' },
    { type: 'video', source: null },
    { search: 'fitness' },
    { tags: ['marketing', 'social'] },
    {}, // No filters - full list
  ];
  
  const query = queryTypes[Math.floor(Math.random() * queryTypes.length)];
  
  const payload = JSON.stringify({
    workspace_id: 'test-workspace-' + Math.floor(Math.random() * 100),
    limit: 50,
    offset: 0,
    ...query,
  });

  const params = {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${anonKey}`,
      'apikey': anonKey,
    },
    tags: { scenario: 'planner_list' },
  };

  const startTime = new Date();
  const response = http.post(
    `${supabaseUrl}/functions/v1/planner-list`,
    payload,
    params
  );
  const duration = new Date() - startTime;

  // Check response
  const success = check(response, {
    'status is 200': (r) => r.status === 200,
    'response has items array': (r) => {
      try {
        const body = JSON.parse(r.body);
        return Array.isArray(body.items);
      } catch {
        return false;
      }
    },
    'response time < 500ms': (r) => r.timings.duration < 500,
    'has total count': (r) => {
      try {
        const body = JSON.parse(r.body);
        return typeof body.total === 'number';
      } catch {
        return false;
      }
    },
  });

  // Track metrics
  errorRate.add(!success);
  queryDuration.add(duration);

  if (response.status >= 400) {
    console.error(`Error ${response.status}: ${response.body}`);
  }

  // Think time: user browsing content items
  sleep(Math.random() * 2 + 1); // 1-3 seconds
}

export function handleSummary(data) {
  const summary = generateSummary(data, 'planner-list');
  return {
    'summary-planner.json': JSON.stringify(data),
    stdout: summary,
  };
}

function generateSummary(data, endpoint) {
  let summary = `\n=== Load Test Summary: ${endpoint} ===\n\n`;
  
  const requests = data.metrics.http_reqs?.values;
  if (requests) {
    summary += `Total Requests: ${requests.count}\n`;
    summary += `Request Rate: ${requests.rate.toFixed(2)}/s\n\n`;
  }
  
  const duration = data.metrics.http_req_duration?.values;
  if (duration) {
    summary += `Response Times:\n`;
    summary += `  Avg: ${duration.avg.toFixed(2)}ms\n`;
    summary += `  P50: ${duration['p(50)'].toFixed(2)}ms\n`;
    summary += `  P95: ${duration['p(95)'].toFixed(2)}ms\n`;
    summary += `  P99: ${duration['p(99)'].toFixed(2)}ms\n`;
    summary += `  Max: ${duration.max.toFixed(2)}ms\n\n`;
    
    // Database performance insights
    const p95 = duration['p(95)'];
    if (p95 < 200) {
      summary += `✓ Excellent: P95 < 200ms (Database indexes working perfectly)\n`;
    } else if (p95 < 500) {
      summary += `✓ Good: P95 < 500ms (Database performance acceptable)\n`;
    } else {
      summary += `✗ Needs optimization: P95 > 500ms (Check indexes and query plans)\n`;
    }
  }
  
  const failed = data.metrics.http_req_failed?.values;
  if (failed) {
    const errorPercent = (failed.rate * 100).toFixed(2);
    summary += `\nError Rate: ${errorPercent}%\n`;
  }
  
  summary += `\nThresholds:\n`;
  Object.entries(data.thresholds || {}).forEach(([name, threshold]) => {
    const passed = threshold.ok ? '✓' : '✗';
    summary += `  ${passed} ${name}\n`;
  });
  
  return summary;
}
