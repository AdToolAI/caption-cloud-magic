import { supabase } from "@/integrations/supabase/client";
import type { Session } from "@supabase/supabase-js";

/**
 * Web-Lock-Kollision der Auth-Bibliothek erkennen.
 * Tritt auf, wenn mehrere Stellen gleichzeitig getSession/refreshSession rufen.
 */
export function isAuthLockError(error: unknown): boolean {
  const message =
    typeof error === "string"
      ? error
      : (error as { message?: string } | null)?.message ?? "";
  return (
    /was released because another request stole it/i.test(message) ||
    /Navigator ?LockManager/i.test(message) ||
    /acquire.*lock.*auth-token/i.test(message)
  );
}

let inFlight: Promise<Session | null> | null = null;

async function resolveSession(): Promise<Session | null> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;

  const { error } = await supabase.auth.getUser();
  if (error) {
    if (isAuthLockError(error)) return session;
    const { data: refreshed } = await supabase.auth.refreshSession();
    if (refreshed?.session) return refreshed.session;
    try {
      await supabase.auth.signOut({ scope: "local" });
    } catch {
      // ignore
    }
    return null;
  }

  return session;
}

/**
 * Returns a session whose access token is actually still valid on the server.
 *
 * Single-flight: parallele Aufrufer teilen sich denselben Auth-Zugriff, damit
 * die Web-Lock-Meldung "Lock ... was released because another request stole it"
 * nicht mehr entsteht. Tritt eine Lock-Kollision dennoch auf, wird genau einmal
 * mit kurzem Backoff wiederholt.
 *
 * Ist die gespeicherte Sitzung serverseitig tot, wird sie lokal entfernt und
 * null zurückgegeben — Aufrufer überspringen ihre Anfrage dann still.
 */
export async function ensureValidSession(): Promise<Session | null> {
  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      return await resolveSession();
    } catch (error) {
      if (isAuthLockError(error)) {
        await new Promise((r) => setTimeout(r, 250));
        try {
          return await resolveSession();
        } catch {
          const { data: { session } } = await supabase.auth.getSession();
          return session ?? null;
        }
      }
      throw error;
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}
