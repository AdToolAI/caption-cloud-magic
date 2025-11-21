/**
 * Setup Script: Create Test Admin User
 * 
 * This script creates a test admin user with proper role assignment
 * Run with: npm run test:setup
 */

import { createClient } from '@supabase/supabase-js';
import { TEST_USERS } from '../fixtures/test-users';

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';

async function createTestAdmin() {
  console.log('🔧 Creating test admin user...');
  
  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const adminUser = TEST_USERS.admin;

  try {
    // Check if user already exists
    const { data: existingUsers } = await supabase.auth.admin.listUsers();
    const userExists = existingUsers?.users.find(u => u.email === adminUser.email);

    if (userExists) {
      console.log('✅ Test admin user already exists:', adminUser.email);
      console.log('   User ID:', userExists.id);
      
      // Ensure role is set
      const { error: roleError } = await supabase
        .from('user_roles')
        .upsert({
          user_id: userExists.id,
          role: adminUser.role,
        });

      if (roleError) {
        console.error('⚠️  Error setting admin role:', roleError.message);
      } else {
        console.log('✅ Admin role verified');
      }

      return;
    }

    // Create new user
    const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
      email: adminUser.email,
      password: adminUser.password,
      email_confirm: true,
    });

    if (createError) {
      throw new Error(`Failed to create user: ${createError.message}`);
    }

    console.log('✅ Test admin user created:', adminUser.email);
    console.log('   User ID:', newUser.user.id);

    // Assign admin role
    const { error: roleError } = await supabase
      .from('user_roles')
      .insert({
        user_id: newUser.user.id,
        role: adminUser.role,
      });

    if (roleError) {
      throw new Error(`Failed to assign admin role: ${roleError.message}`);
    }

    console.log('✅ Admin role assigned successfully');
    console.log('\n📝 Test credentials:');
    console.log('   Email:', adminUser.email);
    console.log('   Password:', adminUser.password);
    console.log('\n⚠️  Remember to set TEST_ADMIN_PASSWORD in .env.test');

  } catch (error) {
    console.error('❌ Error creating test admin:', error);
    process.exit(1);
  }
}

createTestAdmin();
