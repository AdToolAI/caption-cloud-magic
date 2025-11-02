/**
 * k6 Load Test: Content Planner List
 * Target: P95 < 500ms, Error Rate < 0.5%
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const errorRate = new Rate('errors');
const plannerDuration = new Trend('planner_list_duration');

export const options = {
  stages: [
    { duration: '30s', target: 20 },
    { duration: '1m', target: 100 },
    { duration: '30s', target: 150 },
    { duration: '1m', target: 100 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    'http_req_duration': ['p(95)<500'],
    'errors': ['rate<0.005'],
  },
};

const BASE_URL = __ENV.API_URL || 'https://lbunafpxuskwmsrraqxl.supabase.co';
const ANON_KEY = __ENV.ANON_KEY;

export default function () {
  const params = {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${ANON_KEY}`,
      'apikey': ANON_KEY
    },
  };

  const response = http.post(
    `${BASE_URL}/functions/v1/planner-list`,
    JSON.stringify({
      workspace_id: __ENV.WORKSPACE_ID,
      limit: 50
    }),
    params
  );

  plannerDuration.add(response.timings.duration);

  const success = check(response, {
    'status is 200': (r) => r.status === 200,
    'has content items': (r) => Array.isArray(r.json('data')),
    'response time < 500ms': (r) => r.timings.duration < 500,
  });

  errorRate.add(!success);
  sleep(Math.random() * 2 + 1);
}

export function handleSummary(data) {
  return {
    'summary.json': JSON.stringify(data),
    stdout: '\n' + JSON.stringify(data.metrics, null, 2),
  };
}