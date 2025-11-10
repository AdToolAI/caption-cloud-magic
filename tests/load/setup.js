import http from 'k6/http';
import { check } from 'k6';
import exec from 'k6/execution';

// This script sets up test data for load tests
// Run once before executing load tests: k6 run tests/load/setup.js

export const options = {
  vus: 1,
  iterations: 1,
  thresholds: {
    checks: ['rate==1'],
  },
};

export default function () {
  const supabaseUrl = __ENV.SUPABASE_URL || 'https://lbunafpxuskwmsrraqxl.supabase.co';
  const anonKey = __ENV.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxidW5hZnB4dXNrd21zcnJhcXhsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAxMjA3NzUsImV4cCI6MjA3NTY5Njc3NX0.gRvY8kUzrELzlhSdGNJj_CXsaT8mqaUO7F1jCEi2T7Y';
  
  console.log('\n=== Load Test Setup Starting ===\n');
  
  // Generate unique test email
  const timestamp = Date.now();
  const testEmail = `loadtest-${timestamp}@example.com`;
  const testPassword = `LoadTest123!${timestamp}`;
  
  console.log(`Creating test user: ${testEmail}`);
  
  // 1. Create test user
  const signupPayload = JSON.stringify({
    email: testEmail,
    password: testPassword,
    options: {
      data: {
        language: 'en'
      }
    }
  });
  
  const signupResponse = http.post(
    `${supabaseUrl}/auth/v1/signup`,
    signupPayload,
    {
      headers: {
        'Content-Type': 'application/json',
        'apikey': anonKey,
      },
    }
  );
  
  const signupSuccess = check(signupResponse, {
    'user created': (r) => r.status === 200,
    'has user data': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.user && body.user.id;
      } catch (e) {
        return false;
      }
    },
  });
  
  if (!signupSuccess) {
    console.error(`Failed to create user: ${signupResponse.status} - ${signupResponse.body}`);
    exec.test.abort('User creation failed');
    return;
  }
  
  const userData = JSON.parse(signupResponse.body);
  const userId = userData.user.id;

  // If no session returned (email confirmation required), login explicitly
  let accessToken;
  if (userData.session && userData.session.access_token) {
    accessToken = userData.session.access_token;
    console.log('✓ Session obtained from signup');
  } else {
    console.log('⚠ No session from signup, performing login...');
    
    // Login to get session
    const loginResponse = http.post(
      `${supabaseUrl}/auth/v1/token?grant_type=password`,
      JSON.stringify({
        email: testEmail,
        password: testPassword,
      }),
      {
        headers: {
          'apikey': anonKey,
          'Content-Type': 'application/json',
        },
      }
    );
    
    if (loginResponse.status !== 200) {
      console.error(`Login failed: ${loginResponse.status} - ${loginResponse.body}`);
      exec.test.abort('Login failed');
      return;
    }
    
    const loginData = JSON.parse(loginResponse.body);
    accessToken = loginData.access_token;
    console.log('✓ Session obtained from login');
  }

  console.log(`✓ User created: ${userId}`);
  console.log(`✓ Access token obtained`);
  
  // 2. Get or create workspace
  const workspaceResponse = http.get(
    `${supabaseUrl}/rest/v1/workspaces?owner_id=eq.${userId}&select=id,name`,
    {
      headers: {
        'apikey': anonKey,
        'Authorization': `Bearer ${accessToken}`,
      },
    }
  );
  
  let workspaceId;
  
  if (workspaceResponse.status === 200) {
    const workspaces = JSON.parse(workspaceResponse.body);
    if (workspaces && workspaces.length > 0) {
      workspaceId = workspaces[0].id;
      console.log(`✓ Using existing workspace: ${workspaceId}`);
    }
  }
  
  if (!workspaceId) {
    console.log('No workspace found, it should have been created automatically via trigger');
    // Wait a bit for trigger to complete
    http.get(`${supabaseUrl}/rest/v1/workspaces?owner_id=eq.${userId}`, {
      headers: {
        'apikey': anonKey,
        'Authorization': `Bearer ${accessToken}`,
      },
    });
  }
  
  // 3. Create some test projects for planner-list test
  console.log('Creating test projects...');
  
  const projectsPayload = JSON.stringify([
    {
      user_id: userId,
      title: 'Load Test Campaign 1',
      description: 'Test campaign for load testing',
      status: 'active',
    },
    {
      user_id: userId,
      title: 'Load Test Campaign 2',
      description: 'Another test campaign',
      status: 'active',
    },
    {
      user_id: userId,
      title: 'Load Test Campaign 3',
      description: 'Yet another test campaign',
      status: 'draft',
    },
  ]);
  
  const projectsResponse = http.post(
    `${supabaseUrl}/rest/v1/projects`,
    projectsPayload,
    {
      headers: {
        'Content-Type': 'application/json',
        'apikey': anonKey,
        'Authorization': `Bearer ${accessToken}`,
        'Prefer': 'return=minimal',
      },
    }
  );
  
  check(projectsResponse, {
    'projects created': (r) => r.status === 201,
  });
  
  console.log(`✓ Test projects created`);
  
  // 4. Generate config file content
  const config = {
    testUser: {
      email: testEmail,
      password: testPassword,
      userId: userId,
      accessToken: accessToken,
    },
    testWorkspaceId: workspaceId,
    supabaseUrl: supabaseUrl,
    anonKey: anonKey,
    loadLevels: {
      light: {
        stages: [
          { duration: '30s', target: 10 },
          { duration: '1m', target: 50 },
          { duration: '30s', target: 0 },
        ],
        description: 'Light load - 10-50 concurrent users',
      },
      medium: {
        stages: [
          { duration: '1m', target: 50 },
          { duration: '2m', target: 100 },
          { duration: '1m', target: 200 },
          { duration: '1m', target: 0 },
        ],
        description: 'Medium load - 50-200 concurrent users',
      },
      heavy: {
        stages: [
          { duration: '1m', target: 100 },
          { duration: '2m', target: 500 },
          { duration: '2m', target: 1000 },
          { duration: '1m', target: 0 },
        ],
        description: 'Heavy load - 100-1000 concurrent users',
      },
    },
    createdAt: new Date().toISOString(),
  };
  
  console.log('\n=== Setup Complete ===\n');
  console.log('Save the following content to tests/load/config.json:\n');
  console.log(JSON.stringify(config, null, 2));
  console.log('\n=== Configuration ===');
  console.log(`Test User: ${testEmail}`);
  console.log(`User ID: ${userId}`);
  console.log(`Workspace ID: ${workspaceId || 'Will be created automatically'}`);
  console.log(`Access Token: ${accessToken.substring(0, 20)}...`);
  console.log('\nYou can now run load tests using this configuration.');
  console.log('Set environment variables:');
  console.log(`export K6_TEST_USER_EMAIL='${testEmail}'`);
  console.log(`export K6_TEST_USER_PASSWORD='${testPassword}'`);
  console.log(`export K6_TEST_ACCESS_TOKEN='${accessToken}'`);
  console.log(`export K6_TEST_WORKSPACE_ID='${workspaceId}'`);
}
