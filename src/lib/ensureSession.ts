import { supabase } from "@/integrations/supabase/client";

/**
 * Returns a session whose access token is actually still valid on the server.
 * If the stored JWT references a session that no longer exists (e.g. after a
 * server-side sign-out), the dead session is cleared locally and null is
 * returned — callers should then simply skip their authenticated request
 * instead of surfacing a 401 as a runtime error.
 */
export async function ensureValidSession() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;

  const { error } = await supabase.auth.getUser();
  if (error) {
    const { data: refreshed } = await supabase.auth.refreshSession();
    if (refreshed?.session) return refreshed.session;
    try {
      await supabase.auth.signOut({ scope: 'local' });
    } catch {
      // ignore
    }
    return null;
  }

  return session;
}
