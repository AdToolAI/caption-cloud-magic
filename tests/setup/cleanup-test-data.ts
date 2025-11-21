/**
 * Cleanup Script: Remove Test Data
 * 
 * This script cleans up test data from the database
 * Run with: npm run test:cleanup
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';

async function cleanupTestData() {
  console.log('🧹 Cleaning up test data...');
  
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // Clean up test templates (prefixed with test-)
    const { error: templatesError } = await supabase
      .from('video_templates')
      .delete()
      .like('id', 'test-%');

    if (templatesError) {
      console.warn('⚠️  Error cleaning templates:', templatesError.message);
    } else {
      console.log('✅ Test templates cleaned');
    }

    // Clean up test projects
    const { error: projectsError } = await supabase
      .from('content_projects')
      .delete()
      .like('id', 'test-%');

    if (projectsError) {
      console.warn('⚠️  Error cleaning projects:', projectsError.message);
    } else {
      console.log('✅ Test projects cleaned');
    }

    // Clean up test analytics events
    const { error: eventsError } = await supabase
      .from('template_conversion_events')
      .delete()
      .like('template_id', 'test-%');

    if (eventsError) {
      console.warn('⚠️  Error cleaning events:', eventsError.message);
    } else {
      console.log('✅ Test events cleaned');
    }

    // Clean up test A/B tests
    const { error: abTestsError } = await supabase
      .from('template_ab_tests')
      .delete()
      .like('template_id', 'test-%');

    if (abTestsError) {
      console.warn('⚠️  Error cleaning A/B tests:', abTestsError.message);
    } else {
      console.log('✅ Test A/B tests cleaned');
    }

    console.log('\n✅ Cleanup completed successfully');

  } catch (error) {
    console.error('❌ Error during cleanup:', error);
    process.exit(1);
  }
}

cleanupTestData();
