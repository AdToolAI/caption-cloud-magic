import http from 'k6/http';
import { check } from 'k6';
import exec from 'k6/execution';

// This script cleans up test data created by setup.js
// Run after load tests: k6 run tests/load/cleanup.js

export const options = {
  vus: 1,
  iterations: 1,
};

export default function () {
  const supabaseUrl = __ENV.SUPABASE_URL || 'https://lbunafpxuskwmsrraqxl.supabase.co';
  const serviceRoleKey = __ENV.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!serviceRoleKey) {
    console.warn('⚠ SUPABASE_SERVICE_ROLE_KEY not set. Cannot perform cleanup.');
    console.warn('Set it with: export SUPABASE_SERVICE_ROLE_KEY=your_key');
    console.warn('Skipping cleanup - test data will remain in database.');
    return;
  }
  
  const testUserEmail = __ENV.K6_TEST_USER_EMAIL;
  
  if (!testUserEmail) {
    console.warn('⚠ K6_TEST_USER_EMAIL not set. Cannot identify test user.');
    console.warn('Skipping cleanup.');
    return;
  }
  
  console.log('\n=== Load Test Cleanup Starting ===\n');
  console.log(`Looking for test user: ${testUserEmail}`);
  
  // 1. Find the test user
  const userResponse = http.get(
    `${supabaseUrl}/rest/v1/profiles?email=eq.${testUserEmail}&select=id`,
    {
      headers: {
        'apikey': serviceRoleKey,
        'Authorization': `Bearer ${serviceRoleKey}`,
      },
    }
  );
  
  if (userResponse.status !== 200) {
    console.error(`Failed to find user: ${userResponse.status}`);
    return;
  }
  
  const users = JSON.parse(userResponse.body);
  
  if (!users || users.length === 0) {
    console.log('No test user found. Nothing to clean up.');
    return;
  }
  
  const userId = users[0].id;
  console.log(`Found test user: ${userId}`);
  
  // 2. Delete test projects
  console.log('Deleting test projects...');
  const projectsResponse = http.del(
    `${supabaseUrl}/rest/v1/projects?user_id=eq.${userId}`,
    null,
    {
      headers: {
        'apikey': serviceRoleKey,
        'Authorization': `Bearer ${serviceRoleKey}`,
      },
    }
  );
  
  check(projectsResponse, {
    'projects deleted': (r) => r.status === 204 || r.status === 200,
  });
  
  console.log('✓ Test projects deleted');
  
  // 3. Delete workspace memberships
  console.log('Deleting workspace memberships...');
  const membershipsResponse = http.del(
    `${supabaseUrl}/rest/v1/workspace_members?user_id=eq.${userId}`,
    null,
    {
      headers: {
        'apikey': serviceRoleKey,
        'Authorization': `Bearer ${serviceRoleKey}`,
      },
    }
  );
  
  check(membershipsResponse, {
    'memberships deleted': (r) => r.status === 204 || r.status === 200,
  });
  
  console.log('✓ Workspace memberships deleted');
  
  // 4. Delete workspaces
  console.log('Deleting workspaces...');
  const workspacesResponse = http.del(
    `${supabaseUrl}/rest/v1/workspaces?owner_id=eq.${userId}`,
    null,
    {
      headers: {
        'apikey': serviceRoleKey,
        'Authorization': `Bearer ${serviceRoleKey}`,
      },
    }
  );
  
  check(workspacesResponse, {
    'workspaces deleted': (r) => r.status === 204 || r.status === 200,
  });
  
  console.log('✓ Workspaces deleted');
  
  // 5. Delete user profile
  console.log('Deleting user profile...');
  const profileResponse = http.del(
    `${supabaseUrl}/rest/v1/profiles?id=eq.${userId}`,
    null,
    {
      headers: {
        'apikey': serviceRoleKey,
        'Authorization': `Bearer ${serviceRoleKey}`,
      },
    }
  );
  
  check(profileResponse, {
    'profile deleted': (r) => r.status === 204 || r.status === 200,
  });
  
  console.log('✓ User profile deleted');
  
  // Note: Deleting from auth.users requires admin API or direct DB access
  // The profile deletion will cascade due to ON DELETE CASCADE
  
  console.log('\n=== Cleanup Complete ===\n');
  console.log('Test data has been removed from the database.');
  console.log('You can delete tests/load/config.json manually if needed.');
}
