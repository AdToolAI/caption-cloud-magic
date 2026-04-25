import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

/**
 * Block E (Legal) — persistent consent tracking for library uploads.
 *
 * Each consent type carries a *version*. When legal text changes (e.g. AGB
 * update), bump the version constant and users will be re-prompted on next
 * upload, while the prior acceptance row is preserved as an audit trail.
 */

export const CONSENT_VERSIONS = {
  motion_studio_library_upload: '1.0',
} as const;

export type ConsentType = keyof typeof CONSENT_VERSIONS;

export function useLegalConsent(type: ConsentType) {
  const { user } = useAuth();
  const requiredVersion = CONSENT_VERSIONS[type];
  const [hasAccepted, setHasAccepted] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  // Fetch existing consent on mount / user change
  useEffect(() => {
    let cancelled = false;
    if (!user) {
      setHasAccepted(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    (async () => {
      const { data, error } = await supabase
        .from('user_legal_consents')
        .select('id')
        .eq('user_id', user.id)
        .eq('consent_type', type)
        .eq('consent_version', requiredVersion)
        .maybeSingle();
      if (cancelled) return;
      if (error) {
        console.warn('[useLegalConsent] fetch failed:', error.message);
        setHasAccepted(false);
      } else {
        setHasAccepted(!!data);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user, type, requiredVersion]);

  const recordConsent = useCallback(
    async (metadata: Record<string, unknown> = {}) => {
      if (!user) return false;
      const { error } = await supabase.from('user_legal_consents').insert({
        user_id: user.id,
        consent_type: type,
        consent_version: requiredVersion,
        user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
        metadata,
      });
      if (error && !error.message.includes('duplicate')) {
        console.error('[useLegalConsent] record failed:', error.message);
        return false;
      }
      setHasAccepted(true);
      return true;
    },
    [user, type, requiredVersion]
  );

  return { hasAccepted, loading, recordConsent, version: requiredVersion };
}
