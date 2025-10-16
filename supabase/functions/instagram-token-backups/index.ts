import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.75.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return json(null, 204);
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return json({
        ok: false,
        error: 'Server-Konfiguration fehlt'
      }, 500);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // GET - List backups (metadata only)
    if (req.method === 'GET') {
      console.log('Fetching token backups...');
      
      const { data, error } = await supabase
        .from('kv_secrets_backup')
        .select('id, created_at, token_last6, token_hash, scopes, expires_at, created_by')
        .eq('name', 'IG_PAGE_ACCESS_TOKEN')
        .order('created_at', { ascending: false })
        .limit(10);
      
      if (error) {
        console.error('Failed to fetch backups:', error);
        return json({
          ok: false,
          error: 'Backups konnten nicht geladen werden'
        }, 500);
      }
      
      return json({
        ok: true,
        items: data || []
      });
    }

    // POST - Restore backup
    if (req.method === 'POST') {
      const body = await req.json();
      const { action, id } = body;
      
      if (action !== 'restore' || !id) {
        return json({
          ok: false,
          error: 'Invalid request: action=restore und id erforderlich'
        }, 400);
      }
      
      console.log(`Restoring backup with id ${id}...`);
      
      // Fetch backup entry
      const { data: backup, error: fetchError } = await supabase
        .from('kv_secrets_backup')
        .select('*')
        .eq('id', id)
        .single();
      
      if (fetchError || !backup) {
        console.error('Backup not found:', fetchError);
        return json({
          ok: false,
          error: 'Backup nicht gefunden'
        }, 404);
      }
      
      // Restore token to app_secrets
      const { error: restoreError } = await supabase
        .from('app_secrets')
        .upsert({
          name: 'IG_PAGE_ACCESS_TOKEN',
          encrypted_value: backup.encrypted_value,
          updated_at: new Date().toISOString()
        });
      
      if (restoreError) {
        console.error('Failed to restore token:', restoreError);
        return json({
          ok: false,
          error: 'Token-Wiederherstellung fehlgeschlagen',
          details: restoreError
        }, 500);
      }
      
      console.log('Token restored successfully');
      
      return json({
        ok: true,
        restored_id: id,
        message: 'Token erfolgreich wiederhergestellt'
      });
    }

    return json({
      ok: false,
      error: 'Method not allowed'
    }, 405);

  } catch (err: any) {
    console.error('Token backups error:', err);
    return json({
      ok: false,
      error: err?.message || 'Unerwarteter Fehler',
      details: {
        name: err?.name,
        stack: err?.stack?.substring(0, 500),
      }
    }, 500);
  }
});

function json(payload: any, status = 200) {
  return new Response(payload ? JSON.stringify(payload) : null, {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'X-Op': 'token-backups-v1',
    },
  });
}
