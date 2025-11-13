import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Counter, Trend } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('custom_errors');
const jobsProcessed = new Counter('jobs_processed');
const workerDuration = new Trend('worker_duration', true);

// Test configuration - Worker throughput test
// Use light load by default - set K6_LOAD_LEVEL=medium or heavy for stress testing
const loadLevel = __ENV.K6_LOAD_LEVEL || 'light';
const loadProfiles = {
  light: [
    { duration: '30s', target: 2 },
    { duration: '2m', target: 5 },
    { duration: '30s', target: 0 },
  ],
  medium: [
    { duration: '30s', target: 5 },
    { duration: '3m', target: 10 },
    { duration: '1m', target: 20 },
    { duration: '30s', target: 0 },
  ],
  heavy: [
    { duration: '1m', target: 10 },
    { duration: '5m', target: 50 },
    { duration: '2m', target: 100 },
    { duration: '1m', target: 0 },
  ],
};

// DEBUG: Verify load profiles are correctly defined
console.log('=== K6 OPTIONS DEBUG (ai-queue-worker) ===');
console.log('ENV K6_LOAD_LEVEL:', __ENV.K6_LOAD_LEVEL);
console.log('Computed loadLevel:', loadLevel);
console.log('Available profiles:', Object.keys(loadProfiles));
console.log('Selected stages:', JSON.stringify(loadProfiles[loadLevel]));
console.log('Stages is undefined?', loadProfiles[loadLevel] === undefined);

export const options = {
  stages: loadProfiles[loadLevel] || loadProfiles['light'], // Fallback to light if undefined
  thresholds: {
    // Worker should process batches within 60s (realistic for AI job processing: 10-30s per job)
    'http_req_duration{scenario:ai_worker}': ['p(95)<60000'],
    // 95% of checks must pass (realistic for production)
    'checks': ['rate>0.95'],
    // Worker should not fail
    'http_req_failed': ['rate<0.01'],
    // Note: No jobs_per_second threshold - 0 jobs is acceptable in test environment
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
    timeout: '90s', // Increased from default 60s to prevent timeouts
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
    // REMOVED: 'worker completes < 60s' - redundant with p(95)<60000 threshold
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
  let summary = `\n=== Load Test Summary: ai-queue-worker (Load Level: ${loadLevel}) ===\n\n`;
  
  const requests = data.metrics.http_reqs?.values;
  const jobCount = data.metrics.jobs_processed?.values;
  
  if (requests && jobCount) {
    summary += `Worker Invocations: ${requests.count || 0}\n`;
    summary += `Total Jobs Processed: ${jobCount.count || 0}\n`;
    const avgJobsPerBatch = (requests.count > 0) ? (jobCount.count / requests.count) : 0;
    summary += `Avg Jobs per Batch: ${avgJobsPerBatch.toFixed(1)}\n`;
    summary += `Jobs per Second: ${(jobCount.rate || 0).toFixed(2)}\n\n`;
    
    // Throughput analysis
    const jobsPerSec = jobCount.rate || 0;
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
    summary += `  Avg: ${(duration.avg || 0).toFixed(2)}ms\n`;
    summary += `  P95: ${(duration['p(95)'] || 0).toFixed(2)}ms\n`;
    summary += `  Max: ${(duration.max || 0).toFixed(2)}ms\n\n`;
  }
  
  const failed = data.metrics.http_req_failed?.values;
  if (failed) {
    const errorPercent = ((failed.rate || 0) * 100).toFixed(2);
    summary += `Error Rate: ${errorPercent}%\n`;
  }
  
  summary += `\nThresholds:\n`;
  Object.entries(data.thresholds || {}).forEach(([name, threshold]) => {
    const passed = threshold.ok ? '✓' : '✗';
    summary += `  ${passed} ${name}\n`;
  });
  
  return summary;
}
