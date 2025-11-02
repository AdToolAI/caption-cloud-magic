/**
 * k6 Load Test: Publishing Dispatcher
 * Target: P95 < 1000ms, Error Rate < 0.5%
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const errorRate = new Rate('errors');
const publishDuration = new Trend('publish_duration');

export const options = {
  stages: [
    { duration: '30s', target: 5 },
    { duration: '1m', target: 25 },
    { duration: '30s', target: 50 },
    { duration: '1m', target: 25 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    'http_req_duration': ['p(95)<1000'],
    'errors': ['rate<0.005'],
  },
};

const BASE_URL = __ENV.API_URL || 'https://lbunafpxuskwmsrraqxl.supabase.co';
const ANON_KEY = __ENV.ANON_KEY;

export default function () {
  const payload = JSON.stringify({
    event_id: __ENV.TEST_EVENT_ID,
    platforms: ['instagram'],
    scheduled_time: new Date(Date.now() + 3600000).toISOString()
  });

  const params = {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${ANON_KEY}`,
      'apikey': ANON_KEY
    },
  };

  const response = http.post(
    `${BASE_URL}/functions/v1/calendar-publish-dispatcher`,
    payload,
    params
  );

  publishDuration.add(response.timings.duration);

  const success = check(response, {
    'status is 200 or 202': (r) => r.status === 200 || r.status === 202,
    'response time < 1000ms': (r) => r.timings.duration < 1000,
  });

  errorRate.add(!success);
  sleep(Math.random() * 5 + 3);
}

export function handleSummary(data) {
  return {
    'summary.json': JSON.stringify(data),
    stdout: '\n' + JSON.stringify(data.metrics, null, 2),
  };
}