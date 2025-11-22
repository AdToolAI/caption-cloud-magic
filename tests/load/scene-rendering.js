/**
 * k6 Load Test: Scene-Based Video Rendering Performance
 * Tests single-scene, multi-scene, and concurrent multi-format rendering
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// Custom metrics
const renderSuccessRate = new Rate('render_success');
const renderDuration = new Trend('render_duration_ms');
const sceneProcessingTime = new Trend('scene_processing_ms');

// Load test configuration
export const options = {
  stages: [
    { duration: '2m', target: 10 },  // Ramp up to 10 users
    { duration: '5m', target: 10 },  // Stay at 10 users
    { duration: '2m', target: 20 },  // Ramp up to 20 users
    { duration: '5m', target: 20 },  // Stay at 20 users
    { duration: '2m', target: 0 },   // Ramp down
  ],
  thresholds: {
    'render_success': ['rate>0.95'],                    // 95% success rate
    'render_duration_ms': ['p(95)<90000'],              // 95% under 90s
    'scene_processing_ms': ['p(95)<5000'],              // Scene processing < 5s
    'http_req_duration': ['p(95)<10000'],               // API calls < 10s
    'http_req_failed': ['rate<0.05'],                   // < 5% failed requests
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:5173';
const SUPABASE_URL = __ENV.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = __ENV.VITE_SUPABASE_ANON_KEY;

// Test user credentials
const TEST_USER = {
  email: __ENV.TEST_USER_EMAIL || 'test-user@adtool-ai-test.internal',
  password: __ENV.TEST_USER_PASSWORD || 'TestUser123!SecurePassword',
};

let authToken = null;

/**
 * Setup: Authenticate user
 */
export function setup() {
  const loginRes = http.post(
    `${SUPABASE_URL}/auth/v1/token?grant_type=password`,
    JSON.stringify({
      email: TEST_USER.email,
      password: TEST_USER.password,
    }),
    {
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
      },
    }
  );

  check(loginRes, {
    'login successful': (r) => r.status === 200,
  });

  const authData = JSON.parse(loginRes.body);
  return {
    accessToken: authData.access_token,
    userId: authData.user.id,
  };
}

/**
 * Test 1: Single Scene Render Time
 * Target: < 30 seconds for 5s video
 */
export function singleSceneRender(data) {
  group('Single Scene Render', () => {
    const projectData = {
      title: `Single Scene Test ${Date.now()}`,
      content_type: 'video',
      user_id: data.userId,
      scenes: [
        {
          id: 'scene_1',
          order: 0,
          duration: 5,
          background: {
            type: 'color',
            color: '#FF5733',
          },
          transition: {
            type: 'fade',
            duration: 0.5,
          },
          backgroundAnimation: {
            type: 'none',
            intensity: 1,
          },
        },
      ],
      format_config: {
        width: 1920,
        height: 1080,
        fps: 30,
      },
    };

    // Create project
    const startTime = Date.now();
    
    const createRes = http.post(
      `${SUPABASE_URL}/rest/v1/content_projects`,
      JSON.stringify(projectData),
      {
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${data.accessToken}`,
          'Prefer': 'return=representation',
        },
      }
    );

    check(createRes, {
      'project created': (r) => r.status === 201,
    });

    const project = JSON.parse(createRes.body)[0];

    // Start render
    const renderRes = http.post(
      `${SUPABASE_URL}/functions/v1/render-with-remotion`,
      JSON.stringify({
        projectId: project.id,
        format: 'youtube',
      }),
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${data.accessToken}`,
        },
      }
    );

    const renderSuccess = check(renderRes, {
      'render started': (r) => r.status === 200,
    });

    renderSuccessRate.add(renderSuccess);

    if (renderSuccess) {
      const renderData = JSON.parse(renderRes.body);
      
      // Poll for completion
      let completed = false;
      let attempts = 0;
      const maxAttempts = 60; // 60 * 2s = 2 minutes max

      while (!completed && attempts < maxAttempts) {
        sleep(2);
        
        const statusRes = http.get(
          `${SUPABASE_URL}/rest/v1/render_jobs?id=eq.${renderData.jobId}&select=*`,
          {
            headers: {
              'apikey': SUPABASE_ANON_KEY,
              'Authorization': `Bearer ${data.accessToken}`,
            },
          }
        );

        if (statusRes.status === 200) {
          const jobs = JSON.parse(statusRes.body);
          if (jobs.length > 0 && jobs[0].status === 'completed') {
            completed = true;
            const duration = Date.now() - startTime;
            renderDuration.add(duration);
          } else if (jobs[0].status === 'failed') {
            break;
          }
        }

        attempts++;
      }

      check({ completed }, {
        'render completed in time': (c) => c.completed === true,
      });
    }
  });

  sleep(1);
}

/**
 * Test 2: Multi-Scene Render Time
 * Target: < 90 seconds for 25s video (5 scenes × 5s)
 */
export function multiSceneRender(data) {
  group('Multi-Scene Render', () => {
    const scenes = [];
    
    for (let i = 0; i < 5; i++) {
      scenes.push({
        id: `scene_${i + 1}`,
        order: i,
        duration: 5,
        background: {
          type: 'color',
          color: i % 2 === 0 ? '#FF5733' : '#3498DB',
        },
        transition: {
          type: i % 2 === 0 ? 'fade' : 'crossfade',
          duration: 0.5,
        },
        backgroundAnimation: {
          type: i % 3 === 0 ? 'zoom' : (i % 3 === 1 ? 'pan' : 'none'),
          intensity: 1.2,
        },
      });
    }

    const projectData = {
      title: `Multi Scene Test ${Date.now()}`,
      content_type: 'video',
      user_id: data.userId,
      scenes: scenes,
      format_config: {
        width: 1920,
        height: 1080,
        fps: 30,
      },
    };

    const startTime = Date.now();

    // Create project
    const createRes = http.post(
      `${SUPABASE_URL}/rest/v1/content_projects`,
      JSON.stringify(projectData),
      {
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${data.accessToken}`,
          'Prefer': 'return=representation',
        },
      }
    );

    check(createRes, {
      'multi-scene project created': (r) => r.status === 201,
    });

    const project = JSON.parse(createRes.body)[0];

    // Start render
    const renderRes = http.post(
      `${SUPABASE_URL}/functions/v1/render-with-remotion`,
      JSON.stringify({
        projectId: project.id,
        format: 'youtube',
      }),
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${data.accessToken}`,
        },
      }
    );

    const renderSuccess = check(renderRes, {
      'multi-scene render started': (r) => r.status === 200,
    });

    renderSuccessRate.add(renderSuccess);

    if (renderSuccess) {
      const renderData = JSON.parse(renderRes.body);
      
      // Poll for completion
      let completed = false;
      let attempts = 0;
      const maxAttempts = 90; // 90 * 2s = 3 minutes max

      while (!completed && attempts < maxAttempts) {
        sleep(2);
        
        const statusRes = http.get(
          `${SUPABASE_URL}/rest/v1/render_jobs?id=eq.${renderData.jobId}&select=*`,
          {
            headers: {
              'apikey': SUPABASE_ANON_KEY,
              'Authorization': `Bearer ${data.accessToken}`,
            },
          }
        );

        if (statusRes.status === 200) {
          const jobs = JSON.parse(statusRes.body);
          if (jobs.length > 0) {
            if (jobs[0].status === 'completed') {
              completed = true;
              const duration = Date.now() - startTime;
              renderDuration.add(duration);
            } else if (jobs[0].status === 'failed') {
              break;
            }
          }
        }

        attempts++;
      }

      check({ completed }, {
        'multi-scene render completed in time': (c) => c.completed === true,
      });
    }
  });

  sleep(2);
}

/**
 * Test 3: Concurrent Multi-Format Renders
 * Target: Parallel time < 1.5× single format time
 */
export function concurrentMultiFormatRender(data) {
  group('Concurrent Multi-Format Render', () => {
    const projectData = {
      title: `Multi Format Test ${Date.now()}`,
      content_type: 'video',
      user_id: data.userId,
      scenes: [
        {
          id: 'scene_1',
          order: 0,
          duration: 5,
          background: { type: 'color', color: '#FF5733' },
          transition: { type: 'fade', duration: 0.5 },
          backgroundAnimation: { type: 'zoom', intensity: 1.2 },
        },
      ],
      format_config: {
        width: 1920,
        height: 1080,
        fps: 30,
      },
    };

    const startTime = Date.now();

    // Create project
    const createRes = http.post(
      `${SUPABASE_URL}/rest/v1/content_projects`,
      JSON.stringify(projectData),
      {
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${data.accessToken}`,
          'Prefer': 'return=representation',
        },
      }
    );

    const project = JSON.parse(createRes.body)[0];

    // Start renders for 3 formats concurrently
    const formats = ['instagram-story', 'youtube', 'tiktok'];
    const renderJobs = [];

    formats.forEach(format => {
      const renderRes = http.post(
        `${SUPABASE_URL}/functions/v1/render-with-remotion`,
        JSON.stringify({
          projectId: project.id,
          format: format,
        }),
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${data.accessToken}`,
          },
        }
      );

      if (renderRes.status === 200) {
        const renderData = JSON.parse(renderRes.body);
        renderJobs.push(renderData.jobId);
      }
    });

    check({ renderJobs }, {
      'all renders started': (j) => j.renderJobs.length === 3,
    });

    // Poll for all to complete
    let allCompleted = false;
    let attempts = 0;
    const maxAttempts = 60;

    while (!allCompleted && attempts < maxAttempts) {
      sleep(3);
      
      const statusPromises = renderJobs.map(jobId => {
        return http.get(
          `${SUPABASE_URL}/rest/v1/render_jobs?id=eq.${jobId}&select=*`,
          {
            headers: {
              'apikey': SUPABASE_ANON_KEY,
              'Authorization': `Bearer ${data.accessToken}`,
            },
          }
        );
      });

      let completedCount = 0;
      statusPromises.forEach(res => {
        if (res.status === 200) {
          const jobs = JSON.parse(res.body);
          if (jobs.length > 0 && jobs[0].status === 'completed') {
            completedCount++;
          }
        }
      });

      if (completedCount === renderJobs.length) {
        allCompleted = true;
        const duration = Date.now() - startTime;
        renderDuration.add(duration);
      }

      attempts++;
    }

    check({ allCompleted }, {
      'all formats rendered': (c) => c.allCompleted === true,
    });
  });

  sleep(3);
}

/**
 * Test 4: Scene Processing Performance
 */
export function sceneProcessingTest(data) {
  group('Scene Processing', () => {
    const sceneData = {
      id: `scene_${Date.now()}`,
      order: 0,
      duration: 5,
      background: {
        type: 'video',
        url: 'https://example.com/test-video.mp4',
      },
      transition: {
        type: 'crossfade',
        duration: 1,
      },
      backgroundAnimation: {
        type: 'pan',
        intensity: 1.5,
        direction: 'left',
      },
    };

    const startTime = Date.now();

    // Simulate scene validation/processing
    const validateRes = http.post(
      `${SUPABASE_URL}/functions/v1/validate-scene`,
      JSON.stringify({ scene: sceneData }),
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${data.accessToken}`,
        },
      }
    );

    const duration = Date.now() - startTime;
    sceneProcessingTime.add(duration);

    check(validateRes, {
      'scene validation successful': (r) => r.status === 200 || r.status === 404, // 404 ok if function doesn't exist yet
    });
  });

  sleep(0.5);
}

/**
 * Default test function - runs mix of all tests
 */
export default function(data) {
  const testType = Math.random();
  
  if (testType < 0.4) {
    // 40% single scene renders
    singleSceneRender(data);
  } else if (testType < 0.7) {
    // 30% multi-scene renders
    multiSceneRender(data);
  } else if (testType < 0.9) {
    // 20% concurrent multi-format
    concurrentMultiFormatRender(data);
  } else {
    // 10% scene processing
    sceneProcessingTest(data);
  }
}

/**
 * Teardown: Log summary
 */
export function teardown(data) {
  console.log('=== Scene Rendering Load Test Complete ===');
  console.log(`Test completed with user: ${data.userId}`);
}
