/**
 * k6 Load Test: Campaign Generator
 * Target: P95 < 800ms, Error Rate < 0.5%
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');
const campaignDuration = new Trend('campaign_generation_duration');

// Load test configuration
export const options = {
  stages: [
    { duration: '30s', target: 10 },   // Ramp-up
    { duration: '1m', target: 50 },    // Load test
    { duration: '30s', target: 100 },  // Spike test
    { duration: '1m', target: 50 },    // Cooldown
    { duration: '30s', target: 0 },    // Ramp-down
  ],
  thresholds: {
    'http_req_duration': ['p(95)<800'],  // 95% of requests under 800ms
    'errors': ['rate<0.005'],            // Error rate < 0.5%
  },
};

const BASE_URL = __ENV.API_URL || 'https://lbunafpxuskwmsrraqxl.supabase.co';
const ANON_KEY = __ENV.ANON_KEY;

export default function () {
  const payload = JSON.stringify({
    topic: 'Social Media Marketing Tips',
    tone: 'professional',
    platforms: ['instagram', 'linkedin'],
    posts_count: 5
  });

  const params = {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${ANON_KEY}`,
      'apikey': ANON_KEY
    },
  };

  const response = http.post(
    `${BASE_URL}/functions/v1/generate-campaign`,
    payload,
    params
  );

  // Record metrics
  campaignDuration.add(response.timings.duration);
  
  // Check response
  const success = check(response, {
    'status is 200 or 202': (r) => r.status === 200 || r.status === 202,
    'response has data': (r) => r.json('data') !== undefined || r.json('job_id') !== undefined,
    'response time < 800ms': (r) => r.timings.duration < 800,
  });

  errorRate.add(!success);

  // Think time between requests
  sleep(Math.random() * 3 + 2); // 2-5 seconds
}

export function handleSummary(data) {
  return {
    'summary.json': JSON.stringify(data),
    stdout: '\n' + JSON.stringify(data.metrics, null, 2),
  };
}