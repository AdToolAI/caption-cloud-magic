import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Counter, Trend } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');
const jobsProcessed = new Counter('jobs_processed');
const workerDuration = new Trend('worker_duration', true);

// Test configuration - Worker throughput test
export const options = {
  stages: [
    // Warm up
    { duration: '30s', target: 5 },
    // Sustained load - worker should handle ~5 jobs/sec
    { duration: '5m', target: 10 },
    // Stress - push to limits
    { duration: '2m', target: 20 },
    // Cool down
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    // Worker should process batches quickly
    'http_req_duration{scenario:ai_worker}': ['p(95)<1000'],
    // Jobs should complete successfully
    'errors': ['rate<0.01'],
    // Worker should not fail
    'http_req_failed': ['rate<0.01'],
    // Throughput: At least 5 jobs/sec sustained
    'jobs_processed': ['count>1500'], // 5 jobs/sec * 300 seconds = 1500 min
  },
};

export default function () {
  const supabaseUrl = __ENV.SUPABASE_URL || 'https://lbunafpxuskwmsrraqxl.supabase.co';
  const serviceRoleKey = __ENV.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!serviceRoleKey) {
    console.error('SUPABASE_SERVICE_ROLE_KEY is required for ai-queue-worker tests');
    return;
  }

  const params = {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${serviceRoleKey}`,
      'apikey': serviceRoleKey,
    },
    tags: { scenario: 'ai_worker' },
  };

  const startTime = new Date();
  const response = http.post(
    `${supabaseUrl}/functions/v1/ai-queue-worker`,
    JSON.stringify({}),
    params
  );
  const duration = new Date() - startTime;

  // Parse response to count processed jobs
  let processedCount = 0;
  try {
    const body = JSON.parse(response.body);
    processedCount = body.processed || 0;
  } catch (e) {
    console.error('Failed to parse worker response:', e);
  }

  // Check response
  const success = check(response, {
    'status is 200': (r) => r.status === 200,
    'response has processed count': (r) => {
      try {
        const body = JSON.parse(r.body);
        return typeof body.processed === 'number';
      } catch {
        return false;
      }
    },
    'worker completes < 1s': (r) => r.timings.duration < 1000,
  });

  // Track metrics
  errorRate.add(!success);
  workerDuration.add(duration);
  jobsProcessed.add(processedCount);

  if (response.status >= 400) {
    console.error(`Worker error ${response.status}: ${response.body}`);
  } else if (processedCount > 0) {
    console.log(`Worker processed ${processedCount} jobs in ${duration}ms`);
  }

  // Worker polling interval (simulating cron every 2 minutes)
  sleep(2 + Math.random()); // 2-3 seconds in test (sped up from 120s cron)
}

export function handleSummary(data) {
  const summary = generateWorkerSummary(data);
  return {
    'summary-worker.json': JSON.stringify(data),
    stdout: summary,
  };
}

function generateWorkerSummary(data) {
  let summary = `\n=== Load Test Summary: ai-queue-worker ===\n\n`;
  
  const requests = data.metrics.http_reqs?.values;
  const jobCount = data.metrics.jobs_processed?.values;
  
  if (requests && jobCount) {
    summary += `Worker Invocations: ${requests.count}\n`;
    summary += `Total Jobs Processed: ${jobCount.count}\n`;
    summary += `Avg Jobs per Batch: ${(jobCount.count / requests.count).toFixed(1)}\n`;
    summary += `Jobs per Second: ${jobCount.rate.toFixed(2)}\n\n`;
    
    // Throughput analysis
    const jobsPerSec = jobCount.rate;
    if (jobsPerSec >= 5) {
      summary += `✓ Excellent: ${jobsPerSec.toFixed(1)} jobs/sec (Target: 5 jobs/sec)\n`;
    } else if (jobsPerSec >= 3) {
      summary += `⚠ Acceptable: ${jobsPerSec.toFixed(1)} jobs/sec (Below target of 5 jobs/sec)\n`;
    } else {
      summary += `✗ Poor: ${jobsPerSec.toFixed(1)} jobs/sec (Significantly below target)\n`;
    }
  }
  
  const duration = data.metrics.http_req_duration?.values;
  if (duration) {
    summary += `\nWorker Performance:\n`;
    summary += `  Avg: ${duration.avg.toFixed(2)}ms\n`;
    summary += `  P95: ${duration['p(95)'].toFixed(2)}ms\n`;
    summary += `  Max: ${duration.max.toFixed(2)}ms\n\n`;
  }
  
  const failed = data.metrics.http_req_failed?.values;
  if (failed) {
    const errorPercent = (failed.rate * 100).toFixed(2);
    summary += `Error Rate: ${errorPercent}%\n`;
  }
  
  summary += `\nThresholds:\n`;
  Object.entries(data.thresholds || {}).forEach(([name, threshold]) => {
    const passed = threshold.ok ? '✓' : '✗';
    summary += `  ${passed} ${name}\n`;
  });
  
  return summary;
}
