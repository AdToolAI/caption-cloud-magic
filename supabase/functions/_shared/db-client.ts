import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

// Supavisor Connection Pooler Configuration
// Port 6543 = Transaction Mode (optimal for Edge Functions)
// Port 5432 = Direct Connection (only for long sessions/Realtime)

const POOLER_ENABLED = false;

function getPooledUrl(baseUrl: string): string {
  if (!POOLER_ENABLED) return baseUrl;
  
  // Replace default port with pooler port
  // https://xxx.supabase.co → https://xxx.supabase.co:6543
  const url = new URL(baseUrl);
  url.port = '6543'; // Supavisor Transaction Mode
  return url.toString();
}

let cachedClient: SupabaseClient | null = null;

export function getSupabaseClient(useServiceRole = true): SupabaseClient {
  // Reuse client in same function execution (warm starts)
  if (cachedClient) {
    return cachedClient;
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const pooledUrl = getPooledUrl(supabaseUrl);
  
  const key = useServiceRole 
    ? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    : Deno.env.get("SUPABASE_ANON_KEY")!;

  cachedClient = createClient(pooledUrl, key, {
    db: {
      schema: 'public',
    },
    auth: {
      persistSession: false, // Edge Functions are stateless
      autoRefreshToken: false,
    },
    global: {
      headers: {
        'x-connection-pooling': 'supavisor', // Tracking header
      },
    },
  });

  console.log(`[DB Client] Created pooled client (Port 6543)`);
  return cachedClient;
}

// For special cases: Direct Connection (without pooling)
export function getDirectClient(useServiceRole = true): SupabaseClient {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const key = useServiceRole 
    ? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    : Deno.env.get("SUPABASE_ANON_KEY")!;

  console.log(`[DB Client] Created direct client (Port 5432)`);
  return createClient(supabaseUrl, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

// Cleanup helper (optional, for long-running functions)
export function resetClientCache() {
  cachedClient = null;
  console.log(`[DB Client] Cache reset`);
}
