import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');
const queryDuration = new Trend('query_duration');

// Load configuration
const LOAD_LEVEL = __ENV.K6_LOAD_LEVEL || 'ultra';

const LOAD_PROFILES = {
  ultra: {
    stages: [
      { duration: '2m', target: 3000 },  // Ramp-up to 3000 VUs
      { duration: '5m', target: 3000 },  // Hold at 3000 VUs
      { duration: '1m', target: 0 },     // Ramp-down
    ],
    thresholds: {
      http_req_duration: ['p(95)<1500'],  // More lenient for stress test
      http_req_failed: ['rate<0.01'],     // Max 1% error rate
      errors: ['rate<0.01'],
    },
  },
};

export const options = {
  stages: LOAD_PROFILES[LOAD_LEVEL].stages,
  thresholds: LOAD_PROFILES[LOAD_LEVEL].thresholds,
};

export default function () {
  const SUPABASE_URL = __ENV.SUPABASE_URL;
  const SUPABASE_ANON_KEY = __ENV.SUPABASE_ANON_KEY;
  const ACCESS_TOKEN = __ENV.K6_TEST_ACCESS_TOKEN;
  const WORKSPACE_ID = __ENV.K6_TEST_WORKSPACE_ID;

  // Query patterns to simulate real usage
  const queryTypes = [
    { type: null, source: null, search: null, tags: null },
    { type: 'image', source: null, search: null, tags: null },
    { type: 'video', source: null, search: null, tags: null },
    { type: null, source: 'campaign', search: null, tags: null },
    { type: null, source: null, search: 'test', tags: null },
    { type: 'image', source: 'campaign', search: null, tags: null },
  ];

  const query = queryTypes[Math.floor(Math.random() * queryTypes.length)];

  const payload = {
    workspace_id: WORKSPACE_ID,
    ...query,
    limit: 50,
    offset: 0,
  };

  const params = {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${ACCESS_TOKEN}`,
      'apikey': SUPABASE_ANON_KEY,
    },
    timeout: '30s',
  };

  const startTime = new Date().getTime();
  const res = http.post(
    `${SUPABASE_URL}/functions/v1/planner-list`,
    JSON.stringify(payload),
    params
  );
  const duration = new Date().getTime() - startTime;

  const success = check(res, {
    'status is 200': (r) => r.status === 200,
    'has data': (r) => {
      try {
        const body = JSON.parse(r.body);
        return Array.isArray(body.data);
      } catch {
        return false;
      }
    },
    'response time OK': (r) => duration < 3000,
  });

  errorRate.add(!success);
  queryDuration.add(duration);

  sleep(1); // Think time between requests
}

export function handleSummary(data) {
  return {
    stdout: generateSummary(data),
  };
}

function generateSummary(data) {
  const summary = [];
  
  summary.push('\n========================================');
  summary.push('3000 VU LOAD TEST RESULTS - ULTRA STRESS');
  summary.push('========================================\n');
  
  summary.push('Request Statistics:');
  summary.push(`  Total Requests: ${data.metrics.http_reqs.values.count}`);
  summary.push(`  Requests/sec: ${data.metrics.http_reqs.values.rate.toFixed(2)}`);
  summary.push(`  Failed Requests: ${data.metrics.http_req_failed.values.passes || 0}`);
  summary.push('');
  
  summary.push('Response Times:');
  summary.push(`  Min: ${data.metrics.http_req_duration.values.min.toFixed(2)}ms`);
  summary.push(`  Avg: ${data.metrics.http_req_duration.values.avg.toFixed(2)}ms`);
  summary.push(`  P50: ${data.metrics.http_req_duration.values['p(50)'].toFixed(2)}ms`);
  summary.push(`  P95: ${data.metrics.http_req_duration.values['p(95)'].toFixed(2)}ms`);
  summary.push(`  P99: ${data.metrics.http_req_duration.values['p(99)'].toFixed(2)}ms`);
  summary.push(`  Max: ${data.metrics.http_req_duration.values.max.toFixed(2)}ms`);
  summary.push('');
  
  summary.push('Error Rates:');
  summary.push(`  HTTP Errors: ${(data.metrics.http_req_failed.values.rate * 100).toFixed(2)}%`);
  summary.push(`  Custom Errors: ${(data.metrics.errors.values.rate * 100).toFixed(2)}%`);
  summary.push('');
  
  summary.push('Thresholds:');
  const thresholds = data.metrics.http_req_duration.thresholds;
  Object.keys(thresholds).forEach(key => {
    const passed = thresholds[key].ok ? '✓ PASSED' : '✗ FAILED';
    summary.push(`  ${key}: ${passed}`);
  });
  summary.push('');
  
  const p95 = data.metrics.http_req_duration.values['p(95)'];
  const errorRate = data.metrics.errors.values.rate * 100;
  
  summary.push('Performance Assessment:');
  if (p95 < 500 && errorRate < 0.5) {
    summary.push('  ★★★ EXCEPTIONAL - System handles 3000 VUs with ease!');
  } else if (p95 < 1000 && errorRate < 1) {
    summary.push('  ★★☆ EXCELLENT - System stable at maximum scale');
  } else if (p95 < 1500 && errorRate < 5) {
    summary.push('  ★☆☆ ACCEPTABLE - System functional but nearing limits');
  } else {
    summary.push('  ☆☆☆ CRITICAL - System overloaded at this scale');
  }
  summary.push('');
  
  summary.push('========================================\n');
  
  return summary.join('\n');
}
